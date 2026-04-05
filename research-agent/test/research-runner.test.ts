import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  createRunRecord,
  executeResearchRun,
} from "../src/core/research-runner.js";
import { SourceTracker } from "../src/core/source-tracker.js";
import { FileArtifactStore } from "../src/storage/file-artifact-store.js";
import { FileMetadataStore } from "../src/storage/file-metadata-store.js";

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "research-agent-runner-"),
  );
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function makeDeps(
  dataDir: string,
  sourceTracker: SourceTracker,
  buildAgent: (args: {
    workspaceRoot: string;
    sourceTracker: SourceTracker;
    model: string;
    modelProvider: "vertex" | "openai" | "openai-codex" | "anthropic";
    openAiApiKey: string | undefined;
    openAiCodexAccessToken: string | undefined;
    openAiCodexRefreshToken: string | undefined;
    openAiCodexExpiresAt: number | undefined;
    openAiCodexAccountId: string | undefined;
    anthropicApiKey: string | undefined;
  }) => Promise<{
    invoke(
      input: unknown,
      options: unknown,
    ): Promise<{ messages: Array<{ type?: string; content?: unknown }> }>;
  }>,
) {
  return {
    config: {
      dataDir,
      researchAgentModel: "test-model",
      researchAgentModelProvider: "vertex" as const,
      openAiApiKey: undefined,
      openAiCodexAccessToken: undefined,
      openAiCodexRefreshToken: undefined,
      openAiCodexExpiresAt: undefined,
      openAiCodexAccountId: undefined,
      anthropicApiKey: undefined,
    },
    sourceTracker,
    buildAgent,
  };
}

async function createQueuedRun(args: {
  metadataStore: FileMetadataStore;
  runId: string;
  prompt: string;
  executionMode: "local" | "hosted";
}) {
  await createRunRecord({
    request: { prompt: args.prompt },
    executionMode: args.executionMode,
    metadataStore: args.metadataStore,
    runId: args.runId,
  });
}

async function buildSuccessWorkspace(args: {
  workspaceRoot: string;
  sourceTracker: SourceTracker;
}) {
  await fs.mkdir(path.join(args.workspaceRoot, "out"), { recursive: true });
  await fs.mkdir(path.join(args.workspaceRoot, "notes"), { recursive: true });
  await fs.writeFile(
    path.join(args.workspaceRoot, "out", "final-report.md"),
    "# Final Report\n\nBody",
  );
  await fs.writeFile(
    path.join(args.workspaceRoot, "out", "claim-ledger.json"),
    JSON.stringify([
      {
        claim: "Claim A",
        sourceUrls: ["https://official.example.com"],
      },
    ]),
  );
  await fs.writeFile(
    path.join(args.workspaceRoot, "notes", "working.md"),
    "notes",
  );
  args.sourceTracker.recordSearch({
    query: "query",
    observedAt: new Date().toISOString(),
    results: [
      {
        title: "Official Source",
        url: "https://official.example.com/update",
        description: "desc",
        language: "en",
        age: "2 days ago",
      },
      {
        title: "News Source",
        url: "https://news.example.com/story",
        description: "desc",
        language: "en",
        age: "4 days ago",
      },
    ],
  });
}

async function buildSuccessAgent(args: {
  workspaceRoot: string;
  sourceTracker: SourceTracker;
}) {
  await buildSuccessWorkspace(args);
  return {
    async invoke() {
      return {
        messages: [{ type: "ai", content: "fallback report text" }],
      };
    },
  };
}

async function assertCompletedArtifacts(args: {
  artifactStore: FileArtifactStore;
  completed: Awaited<ReturnType<typeof executeResearchRun>>;
  runId: string;
}) {
  assert.equal(args.completed.status, "completed");
  assert.equal(args.completed.freshnessVerdict, "passed");
  assert.ok(args.completed.artifactPointers.report);
  assert.ok(args.completed.artifactPointers.provenance);
  assert.ok(args.completed.artifactPointers.summary);
  assert.deepEqual(args.completed.artifactPointers.notes, ["notes/working.md"]);
  assert.deepEqual(args.completed.artifactPointers.out, [
    "out/claim-ledger.json",
    "out/final-report.md",
  ]);

  const artifacts = await args.artifactStore.listArtifacts(args.runId);
  assert.deepEqual(artifacts, [
    "notes/working.md",
    "out/claim-ledger.json",
    "out/final-report.md",
    "provenance.json",
    "report.md",
    "summary.json",
  ]);
}

async function runSuccessScenario(dir: string) {
  const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
  const artifactStore = new FileArtifactStore(path.join(dir, "artifacts"));
  const sourceTracker = new SourceTracker();
  const runId = "run-success";
  const prompt = "What is the latest UK AI market update?";

  await createQueuedRun({
    metadataStore,
    runId,
    prompt,
    executionMode: "local",
  });
  const completed = await executeResearchRun({
    runId,
    request: { prompt },
    executionMode: "local",
    metadataStore,
    artifactStore,
    deps: makeDeps(dir, sourceTracker, buildSuccessAgent),
  });

  await assertCompletedArtifacts({ artifactStore, completed, runId });
  const report = (
    await artifactStore.readArtifact(runId, "report.md")
  ).toString("utf8");
  assert.match(report, /Freshness verdict: `passed`/);
  assert.match(report, /# Final Report/);
}

async function buildFreshnessFailureAgent(args: { workspaceRoot: string }) {
  await fs.mkdir(path.join(args.workspaceRoot, "out"), { recursive: true });
  await fs.writeFile(
    path.join(args.workspaceRoot, "out", "final-report.md"),
    "Report body",
  );
  return {
    async invoke() {
      return {
        messages: [{ type: "ai", content: "fallback report text" }],
      };
    },
  };
}

async function runFreshnessFailureScenario(dir: string) {
  const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
  const artifactStore = new FileArtifactStore(path.join(dir, "artifacts"));
  const sourceTracker = new SourceTracker();
  const runId = "run-freshness-fail";
  const prompt = "What is the latest state of the market?";

  await createQueuedRun({
    metadataStore,
    runId,
    prompt,
    executionMode: "hosted",
  });
  const completed = await executeResearchRun({
    runId,
    request: { prompt },
    executionMode: "hosted",
    metadataStore,
    artifactStore,
    deps: makeDeps(dir, sourceTracker, buildFreshnessFailureAgent),
  });

  assert.equal(completed.status, "awaiting_review");
  assert.equal(completed.reviewStatus, "pending");
  assert.equal(completed.freshnessVerdict, "failed");
}

test("createRunRecord classifies freshness sensitivity from the prompt", async () => {
  await withTempDir(async (dir) => {
    const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
    const record = await createRunRecord({
      request: { prompt: "What is the latest AI policy in the UK?" },
      executionMode: "hosted",
      metadataStore,
      runId: "run-classify",
    });

    assert.equal(record.freshnessSensitivity, "time_sensitive");
    assert.equal(record.status, "queued");
  });
});

test("executeResearchRun completes and persists report, provenance, summary, and workspace artifacts", async () => {
  await withTempDir(runSuccessScenario);
});

test("executeResearchRun forces review when freshness fails for time-sensitive prompts", async () => {
  await withTempDir(runFreshnessFailureScenario);
});

test("executeResearchRun records failures without rethrow when configured that way", async () => {
  await withTempDir(async (dir) => {
    const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
    const artifactStore = new FileArtifactStore(path.join(dir, "artifacts"));
    const runId = "run-fail";
    const prompt = "Research something";

    await createRunRecord({
      request: { prompt },
      executionMode: "local",
      metadataStore,
      runId,
    });

    const failed = await executeResearchRun({
      runId,
      request: { prompt },
      executionMode: "local",
      metadataStore,
      artifactStore,
      deps: makeDeps(dir, new SourceTracker(), async () => ({
        async invoke() {
          throw new Error("agent failed");
        },
      })),
    });

    assert.equal(failed.status, "failed");
    assert.equal(failed.errorMessage, "agent failed");
  });
});

test("executeResearchRun rethrows for hosted retry semantics when requested", async () => {
  await withTempDir(async (dir) => {
    const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
    const artifactStore = new FileArtifactStore(path.join(dir, "artifacts"));
    const runId = "run-rethrow";
    const prompt = "Research something";

    await createRunRecord({
      request: { prompt },
      executionMode: "hosted",
      metadataStore,
      runId,
    });

    await assert.rejects(
      executeResearchRun({
        runId,
        request: { prompt },
        executionMode: "hosted",
        metadataStore,
        artifactStore,
        rethrowOnFailure: true,
        deps: makeDeps(dir, new SourceTracker(), async () => ({
          async invoke() {
            throw new Error("retry me");
          },
        })),
      }),
      /retry me/,
    );

    const updated = await metadataStore.getRun(runId);
    assert.equal(updated?.status, "failed");
    assert.equal(updated?.errorMessage, "retry me");
  });
});
