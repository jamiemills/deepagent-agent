import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { executeResearchRun } from "../src/core/research-runner.js";
import { SourceTracker } from "../src/core/source-tracker.js";
import type { ResearchJobRecord } from "../src/core/types.js";
import type { TemporalClientLike } from "../src/service/server.js";
import type { FileArtifactStore } from "../src/storage/file-artifact-store.js";
import type { FileMetadataStore } from "../src/storage/file-metadata-store.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const cliMockFetchFixturePath = path.join(
  projectRoot,
  "test",
  "fixtures",
  "mock-cli-fetch.mjs",
);

export async function withTempDir<T>(
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "research-agent-integration-"),
  );
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export function createInlineTemporalClient(args: {
  dataDir: string;
  metadataStore: FileMetadataStore;
  artifactStore: FileArtifactStore;
  delayMs?: number;
}) {
  const cancelledRuns = new Set<string>();

  return {
    temporalClient: createTemporalWorkflowClient(args, cancelledRuns),
    cancelledRuns,
  };
}

export async function waitForRun(
  load: () => Promise<ResearchJobRecord>,
  predicate: (record: ResearchJobRecord) => boolean,
  timeoutMs = 8_000,
) {
  const startedAt = Date.now();
  let lastRecord: ResearchJobRecord | undefined;
  let lastError: Error | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const record = await load();
      lastRecord = record;
      lastError = undefined;

      if (predicate(record)) {
        return record;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    await sleep(50);
  }

  if (lastRecord) {
    assert.fail(
      `timed out waiting for run state; last status was ${lastRecord.status}`,
    );
  }

  assert.fail(
    `timed out waiting for run state; last error was ${
      lastError?.message ?? "unknown"
    }`,
  );
}

export async function runCliCommand(args: string[], env?: NodeJS.ProcessEnv) {
  return new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
  }>((resolve, reject) => {
    const childEnv = {
      ...process.env,
      ...env,
    };
    const commandArgs = ["run"];
    const preloadModule = childEnv["BUN_PRELOAD_MODULE"];
    if (preloadModule) {
      commandArgs.push(`--preload=${preloadModule}`);
    }
    commandArgs.push("src/cli.ts", ...args);

    const child = spawn("bun", commandArgs, {
      cwd: projectRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve({ stdout, stderr, exitCode });
        return;
      }

      reject(
        new Error(
          `CLI command failed with exit code ${String(exitCode)}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    });
  });
}

export async function writeCliMockFetchModule(dir: string) {
  const modulePath = path.join(dir, "mock-cli-fetch.mjs");
  const content = await fs.readFile(cliMockFetchFixturePath, "utf8");
  await fs.writeFile(modulePath, content);
  return pathToFileURL(modulePath).href;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getWorkflowPayload(options: { args: unknown[] }) {
  const payload = options.args[0];
  if (!payload) {
    throw new Error("expected Temporal workflow payload");
  }
  return payload as {
    runId: string;
    request: { prompt: string };
  };
}

function buildHostedConfig(dataDir: string) {
  return {
    dataDir,
    researchAgentModel: "test-model",
    researchAgentModelProvider: "vertex" as const,
    openAiApiKey: undefined,
    openAiCodexAccessToken: undefined,
    openAiCodexRefreshToken: undefined,
    openAiCodexExpiresAt: undefined,
    openAiCodexAccountId: undefined,
    anthropicApiKey: undefined,
  };
}

async function writeHostedWorkspaceArtifacts(
  workspaceRoot: string,
  prompt: string,
) {
  await fs.mkdir(path.join(workspaceRoot, "notes"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "out"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, "notes", "working.md"),
    `Working notes for ${prompt}`,
  );
  await fs.writeFile(
    path.join(workspaceRoot, "out", "final-report.md"),
    `# Hosted Report\n\nPrompt: ${prompt}\n`,
  );
  await fs.writeFile(
    path.join(workspaceRoot, "out", "claim-ledger.json"),
    JSON.stringify([
      {
        claim: "Hosted claim",
        sourceUrls: ["https://official.example.com/update"],
        confidence: "high",
        notes: "integration helper",
      },
    ]),
  );
}

function recordHostedSearch(sourceTracker: SourceTracker, prompt: string) {
  sourceTracker.recordSearch({
    query: prompt,
    observedAt: new Date().toISOString(),
    results: [
      {
        title: "Official source",
        url: "https://official.example.com/update",
        description: "Fresh official source",
        language: "en",
        age: "2 days ago",
      },
      {
        title: "Secondary source",
        url: "https://analysis.example.com/deep-agents",
        description: "Recent analysis",
        language: "en",
        age: "5 days ago",
      },
    ],
  });
}

function createHostedBuildAgent(prompt: string) {
  return async (args: {
    workspaceRoot: string;
    sourceTracker: SourceTracker;
  }) => {
    await writeHostedWorkspaceArtifacts(args.workspaceRoot, prompt);
    recordHostedSearch(args.sourceTracker, prompt);

    return {
      async invoke() {
        return {
          messages: [{ type: "ai", content: "Hosted report fallback" }],
        };
      },
    };
  };
}

async function runInlineWorkflow(
  args: {
    dataDir: string;
    metadataStore: FileMetadataStore;
    artifactStore: FileArtifactStore;
    delayMs?: number;
  },
  cancelledRuns: Set<string>,
  payload: { runId: string; request: { prompt: string } },
) {
  if (args.delayMs) {
    await sleep(args.delayMs);
  }
  if (cancelledRuns.has(payload.runId)) {
    return;
  }

  await executeResearchRun({
    runId: payload.runId,
    request: payload.request,
    executionMode: "hosted",
    metadataStore: args.metadataStore,
    artifactStore: args.artifactStore,
    rethrowOnFailure: true,
    deps: {
      config: buildHostedConfig(args.dataDir),
      sourceTracker: new SourceTracker(),
      buildAgent: createHostedBuildAgent(payload.request.prompt),
    },
  });
}

function startInlineWorkflow(
  args: {
    dataDir: string;
    metadataStore: FileMetadataStore;
    artifactStore: FileArtifactStore;
    delayMs?: number;
  },
  cancelledRuns: Set<string>,
  options: { args: unknown[] },
) {
  const payload = getWorkflowPayload(options);
  runInlineWorkflow(args, cancelledRuns, payload).catch(() => {
    // Errors are already reflected in the mocked run state.
  });
}

function createTemporalWorkflowClient(
  args: {
    dataDir: string;
    metadataStore: FileMetadataStore;
    artifactStore: FileArtifactStore;
    delayMs?: number;
  },
  cancelledRuns: Set<string>,
): TemporalClientLike {
  return {
    workflow: {
      async start(_workflow, options) {
        startInlineWorkflow(args, cancelledRuns, options);
        return {};
      },
      getHandle(workflowId: string) {
        return {
          async cancel() {
            cancelledRuns.add(workflowId);
          },
        };
      },
    },
  };
}
