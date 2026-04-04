import fs from "node:fs/promises";
import path from "node:path";

import { buildResearchAgent } from "../agent.js";
import { loadConfig } from "../config.js";
import type { ResearchModelProvider } from "../model-provider.js";
import type { ArtifactStore, MetadataStore } from "../storage/interfaces.js";
import {
  classifyFreshnessSensitivity,
  evaluateFreshness,
} from "./freshness.js";
import { buildProvenanceManifest, buildSourceRecords } from "./provenance.js";
import {
  decorateReportMarkdown,
  extractFinalAiText,
  readCanonicalReport,
  readClaimLedger,
} from "./report.js";
import {
  completionPatch,
  createQueuedRunRecord,
  failurePatch,
  runningPatch,
} from "./run-records.js";
import { researchJobRequestSchema } from "./schemas.js";
import { SourceTracker } from "./source-tracker.js";
import type {
  ExecutionMode,
  ResearchJobRecord,
  ResearchJobRequest,
} from "./types.js";

type AgentInvokeResult = {
  messages: Array<{ type?: string; content?: unknown }>;
};

type AgentLike = {
  invoke(
    input: {
      messages: Array<{ role: string; content: string }>;
    },
    options: { recursionLimit: number },
  ): Promise<AgentInvokeResult>;
};

type ResearchRunDeps = {
  config: {
    dataDir: string;
    researchAgentModel: string;
    researchAgentModelProvider: ResearchModelProvider;
    openAiApiKey: string | undefined;
    openAiCodexAccessToken: string | undefined;
    openAiCodexRefreshToken: string | undefined;
    openAiCodexExpiresAt: number | undefined;
    openAiCodexAccountId: string | undefined;
    anthropicApiKey: string | undefined;
  };
  sourceTracker: SourceTracker;
  buildAgent: (args: {
    workspaceRoot: string;
    sourceTracker: SourceTracker;
    model: string;
    modelProvider: ResearchModelProvider;
    openAiApiKey: string | undefined;
    openAiCodexAccessToken: string | undefined;
    openAiCodexRefreshToken: string | undefined;
    openAiCodexExpiresAt: number | undefined;
    openAiCodexAccountId: string | undefined;
    anthropicApiKey: string | undefined;
  }) => Promise<AgentLike>;
};

type ResearchArtifacts = {
  decoratedReport: string;
  assessment: ReturnType<typeof evaluateFreshness>;
  claimLedger: Awaited<ReturnType<typeof readClaimLedger>>;
  sources: ReturnType<typeof buildSourceRecords>;
};

async function ensureWorkspace(workspaceRoot: string): Promise<void> {
  await fs.mkdir(path.join(workspaceRoot, "notes"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "out"), { recursive: true });
}

async function collectFiles(root: string): Promise<string[]> {
  async function walk(current: string, prefix = ""): Promise<string[]> {
    try {
      const entries = await fs.readdir(current, { withFileTypes: true });

      const files: string[] = [];
      for (const entry of entries) {
        const absolute = path.join(current, entry.name);
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          files.push(...(await walk(absolute, relative)));
        } else {
          files.push(relative);
        }
      }
      return files.sort();
    } catch {
      return [];
    }
  }

  return walk(root);
}

async function copyWorkspaceArtifacts(args: {
  runId: string;
  workspaceRoot: string;
  artifactStore: ArtifactStore;
}): Promise<{ notes: string[]; out: string[] }> {
  const notesDir = path.join(args.workspaceRoot, "notes");
  const outDir = path.join(args.workspaceRoot, "out");
  const notes = await collectFiles(notesDir);
  const out = await collectFiles(outDir);

  for (const note of notes) {
    await args.artifactStore.copyFromFile(
      args.runId,
      `notes/${note}`,
      path.join(notesDir, note),
    );
  }

  for (const file of out) {
    await args.artifactStore.copyFromFile(
      args.runId,
      `out/${file}`,
      path.join(outDir, file),
    );
  }

  return {
    notes: notes.map((file) => `notes/${file}`),
    out: out.map((file) => `out/${file}`),
  };
}

function resolveResearchRunDeps(
  providedDeps?: ResearchRunDeps,
): ResearchRunDeps {
  if (providedDeps) {
    return providedDeps;
  }

  const resolvedConfig = loadConfig();
  return {
    config: {
      dataDir: resolvedConfig.dataDir,
      researchAgentModel: resolvedConfig.researchAgentModel,
      researchAgentModelProvider: resolvedConfig.researchAgentModelProvider,
      openAiApiKey: resolvedConfig.openAiApiKey,
      openAiCodexAccessToken: resolvedConfig.openAiCodexAccessToken,
      openAiCodexRefreshToken: resolvedConfig.openAiCodexRefreshToken,
      openAiCodexExpiresAt: resolvedConfig.openAiCodexExpiresAt,
      openAiCodexAccountId: resolvedConfig.openAiCodexAccountId,
      anthropicApiKey: resolvedConfig.anthropicApiKey,
    },
    sourceTracker: new SourceTracker(),
    buildAgent: buildResearchAgent,
  };
}

async function buildAgentForRun(args: {
  deps: ResearchRunDeps;
  workspaceRoot: string;
}) {
  return args.deps.buildAgent({
    workspaceRoot: args.workspaceRoot,
    sourceTracker: args.deps.sourceTracker,
    model: args.deps.config.researchAgentModel,
    modelProvider: args.deps.config.researchAgentModelProvider,
    openAiApiKey: args.deps.config.openAiApiKey,
    openAiCodexAccessToken: args.deps.config.openAiCodexAccessToken,
    openAiCodexRefreshToken: args.deps.config.openAiCodexRefreshToken,
    openAiCodexExpiresAt: args.deps.config.openAiCodexExpiresAt,
    openAiCodexAccountId: args.deps.config.openAiCodexAccountId,
    anthropicApiKey: args.deps.config.anthropicApiKey,
  });
}

async function invokeResearchAgent(args: {
  deps: ResearchRunDeps;
  workspaceRoot: string;
  prompt: string;
}) {
  const agent = await buildAgentForRun(args);
  return agent.invoke(
    {
      messages: [
        {
          role: "user",
          content: args.prompt,
        },
      ],
    },
    {
      recursionLimit: 100,
    },
  );
}

async function buildResearchArtifacts(args: {
  runId: string;
  prompt: string;
  workspaceRoot: string;
  sourceTracker: SourceTracker;
  messages: Array<{ type?: string; content?: unknown }>;
  metadataStore: MetadataStore;
}) {
  const finalText = extractFinalAiText(args.messages);
  const rawReport = await readCanonicalReport(args.workspaceRoot, finalText);
  const claimLedger = await readClaimLedger(args.workspaceRoot);
  const sources = buildSourceRecords(
    args.sourceTracker.getSearchObservations(),
    args.sourceTracker.getFetchObservations(),
  );
  const freshnessSensitivity = classifyFreshnessSensitivity(args.prompt);
  const assessment = evaluateFreshness(freshnessSensitivity, sources);
  const existing = await args.metadataStore.getRun(args.runId);

  if (!existing) {
    throw new Error(`Run ${args.runId} disappeared during execution.`);
  }

  const reviewStatus =
    assessment.verdict === "failed" ? "pending" : existing.reviewStatus;
  const decoratedReport = decorateReportMarkdown({
    reportBody: rawReport,
    record: {
      id: existing.id,
      executionMode: existing.executionMode,
      reviewStatus,
    },
    assessment,
  });

  return { decoratedReport, assessment, claimLedger, sources };
}

async function writeRunArtifacts(args: {
  runId: string;
  prompt: string;
  workspaceRoot: string;
  artifactStore: ArtifactStore;
  artifacts: ResearchArtifacts;
}) {
  const provenance = buildProvenanceManifest({
    runId: args.runId,
    prompt: args.prompt,
    assessment: args.artifacts.assessment,
    sources: args.artifacts.sources,
    claimLedger: args.artifacts.claimLedger,
  });
  const copiedArtifacts = await copyWorkspaceArtifacts({
    runId: args.runId,
    workspaceRoot: args.workspaceRoot,
    artifactStore: args.artifactStore,
  });

  return {
    report: await args.artifactStore.writeText(
      args.runId,
      "report.md",
      args.artifacts.decoratedReport,
    ),
    provenance: await args.artifactStore.writeJson(
      args.runId,
      "provenance.json",
      provenance,
    ),
    summary: await args.artifactStore.writeJson(args.runId, "summary.json", {
      runId: args.runId,
      freshness: args.artifacts.assessment,
      sourceCount: args.artifacts.sources.length,
      claimCount: args.artifacts.claimLedger.length,
    }),
    notes: copiedArtifacts.notes,
    out: copiedArtifacts.out,
  };
}

async function completeResearchRun(args: {
  runId: string;
  prompt: string;
  workspaceRoot: string;
  deps: ResearchRunDeps;
  metadataStore: MetadataStore;
  artifactStore: ArtifactStore;
}) {
  const result = await invokeResearchAgent({
    deps: args.deps,
    workspaceRoot: args.workspaceRoot,
    prompt: args.prompt,
  });
  const artifacts = await buildResearchArtifacts({
    runId: args.runId,
    prompt: args.prompt,
    workspaceRoot: args.workspaceRoot,
    sourceTracker: args.deps.sourceTracker,
    messages: result.messages as Array<{ type?: string; content?: unknown }>,
    metadataStore: args.metadataStore,
  });
  const artifactPointers = await writeRunArtifacts({
    runId: args.runId,
    prompt: args.prompt,
    workspaceRoot: args.workspaceRoot,
    artifactStore: args.artifactStore,
    artifacts,
  });

  return args.metadataStore.updateRun(
    args.runId,
    completionPatch({
      assessment: artifacts.assessment,
      artifactPointers,
      reportExcerpt: artifacts.decoratedReport.slice(0, 500),
    }),
  );
}

async function failResearchRun(args: {
  runId: string;
  metadataStore: MetadataStore;
  error: unknown;
  rethrowOnFailure: boolean | undefined;
}) {
  const failedRecord = await args.metadataStore.updateRun(
    args.runId,
    failurePatch(args.error),
  );
  if (args.rethrowOnFailure) {
    throw args.error;
  }
  return failedRecord;
}

export async function createRunRecord(args: {
  request: ResearchJobRequest;
  executionMode: ExecutionMode;
  metadataStore: MetadataStore;
  runId?: string;
}): Promise<ResearchJobRecord> {
  const request = researchJobRequestSchema.parse(args.request);
  const freshnessSensitivity = classifyFreshnessSensitivity(request.prompt);
  const record = createQueuedRunRecord(
    request,
    args.executionMode,
    freshnessSensitivity,
    args.runId,
  );
  await args.metadataStore.createRun(record);
  return record;
}

export async function executeResearchRun(args: {
  runId: string;
  request: ResearchJobRequest;
  executionMode: ExecutionMode;
  metadataStore: MetadataStore;
  artifactStore: ArtifactStore;
  rethrowOnFailure?: boolean;
  deps?: ResearchRunDeps;
}): Promise<ResearchJobRecord> {
  const request = researchJobRequestSchema.parse(args.request);
  const deps = resolveResearchRunDeps(args.deps);
  const workspaceRoot = path.join(
    deps.config.dataDir,
    "workspaces",
    args.runId,
  );

  await ensureWorkspace(workspaceRoot);
  await args.metadataStore.updateRun(args.runId, runningPatch());

  try {
    return await completeResearchRun({
      runId: args.runId,
      prompt: request.prompt,
      workspaceRoot,
      deps,
      metadataStore: args.metadataStore,
      artifactStore: args.artifactStore,
    });
  } catch (error) {
    return failResearchRun({
      runId: args.runId,
      metadataStore: args.metadataStore,
      error,
      rethrowOnFailure: args.rethrowOnFailure,
    });
  }
}
