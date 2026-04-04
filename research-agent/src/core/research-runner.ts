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
    openAiAccessToken: string | undefined;
    anthropicApiKey: string | undefined;
  };
  sourceTracker: SourceTracker;
  buildAgent: (args: {
    workspaceRoot: string;
    sourceTracker: SourceTracker;
    model: string;
    modelProvider: ResearchModelProvider;
    openAiApiKey: string | undefined;
    openAiAccessToken: string | undefined;
    anthropicApiKey: string | undefined;
  }) => Promise<AgentLike>;
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
  const deps =
    args.deps ??
    (() => {
      const resolvedConfig = loadConfig();

      return {
        config: {
          dataDir: resolvedConfig.dataDir,
          researchAgentModel: resolvedConfig.researchAgentModel,
          researchAgentModelProvider: resolvedConfig.researchAgentModelProvider,
          openAiApiKey: resolvedConfig.openAiApiKey,
          openAiAccessToken: resolvedConfig.openAiAccessToken,
          anthropicApiKey: resolvedConfig.anthropicApiKey,
        },
        sourceTracker: new SourceTracker(),
        buildAgent: buildResearchAgent,
      };
    })();
  const workspaceRoot = path.join(
    deps.config.dataDir,
    "workspaces",
    args.runId,
  );
  const sourceTracker = deps.sourceTracker;

  await ensureWorkspace(workspaceRoot);
  await args.metadataStore.updateRun(args.runId, runningPatch());

  try {
    const agent = await deps.buildAgent({
      workspaceRoot,
      sourceTracker,
      model: deps.config.researchAgentModel,
      modelProvider: deps.config.researchAgentModelProvider,
      openAiApiKey: deps.config.openAiApiKey,
      openAiAccessToken: deps.config.openAiAccessToken,
      anthropicApiKey: deps.config.anthropicApiKey,
    });

    const result = await agent.invoke(
      {
        messages: [
          {
            role: "user",
            content: request.prompt,
          },
        ],
      },
      {
        recursionLimit: 100,
      },
    );

    const finalText = extractFinalAiText(
      result.messages as Array<{ type?: string; content?: unknown }>,
    );
    const rawReport = await readCanonicalReport(workspaceRoot, finalText);
    const claimLedger = await readClaimLedger(workspaceRoot);
    const sources = buildSourceRecords(
      sourceTracker.getSearchObservations(),
      sourceTracker.getFetchObservations(),
    );
    const freshnessSensitivity = classifyFreshnessSensitivity(request.prompt);
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

    const provenance = buildProvenanceManifest({
      runId: args.runId,
      prompt: request.prompt,
      assessment,
      sources,
      claimLedger,
    });

    const copiedArtifacts = await copyWorkspaceArtifacts({
      runId: args.runId,
      workspaceRoot,
      artifactStore: args.artifactStore,
    });

    const artifactPointers = {
      report: await args.artifactStore.writeText(
        args.runId,
        "report.md",
        decoratedReport,
      ),
      provenance: await args.artifactStore.writeJson(
        args.runId,
        "provenance.json",
        provenance,
      ),
      summary: await args.artifactStore.writeJson(args.runId, "summary.json", {
        runId: args.runId,
        freshness: assessment,
        sourceCount: sources.length,
        claimCount: claimLedger.length,
      }),
      notes: copiedArtifacts.notes,
      out: copiedArtifacts.out,
    };

    return args.metadataStore.updateRun(
      args.runId,
      completionPatch({
        assessment,
        artifactPointers,
        reportExcerpt: decoratedReport.slice(0, 500),
      }),
    );
  } catch (error) {
    const failedRecord = await args.metadataStore.updateRun(
      args.runId,
      failurePatch(error),
    );
    if (args.rethrowOnFailure) {
      throw error;
    }
    return failedRecord;
  }
}
