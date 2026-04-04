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
    modelProvider: "vertex" | "openai" | "anthropic";
    openAiApiKey?: string;
    anthropicApiKey?: string;
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
      anthropicApiKey: undefined,
    },
    sourceTracker,
    buildAgent,
  };
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
  await withTempDir(async (dir) => {
    const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
    const artifactStore = new FileArtifactStore(path.join(dir, "artifacts"));
    const sourceTracker = new SourceTracker();
    const runId = "run-success";
    const prompt = "What is the latest UK AI market update?";

    await createRunRecord({
      request: { prompt },
      executionMode: "local",
      metadataStore,
      runId,
    });

    const completed = await executeResearchRun({
      runId,
      request: { prompt },
      executionMode: "local",
      metadataStore,
      artifactStore,
      deps: makeDeps(
        dir,
        sourceTracker,
        async ({ workspaceRoot, sourceTracker: tracker }) => {
          await fs.mkdir(path.join(workspaceRoot, "out"), { recursive: true });
          await fs.mkdir(path.join(workspaceRoot, "notes"), {
            recursive: true,
          });
          await fs.writeFile(
            path.join(workspaceRoot, "out", "final-report.md"),
            "# Final Report\n\nBody",
          );
          await fs.writeFile(
            path.join(workspaceRoot, "out", "claim-ledger.json"),
            JSON.stringify([
              {
                claim: "Claim A",
                sourceUrls: ["https://official.example.com"],
              },
            ]),
          );
          await fs.writeFile(
            path.join(workspaceRoot, "notes", "working.md"),
            "notes",
          );

          tracker.recordSearch({
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

          return {
            async invoke() {
              return {
                messages: [{ type: "ai", content: "fallback report text" }],
              };
            },
          };
        },
      ),
    });

    assert.equal(completed.status, "completed");
    assert.equal(completed.freshnessVerdict, "passed");
    assert.ok(completed.artifactPointers.report);
    assert.ok(completed.artifactPointers.provenance);
    assert.ok(completed.artifactPointers.summary);
    assert.deepEqual(completed.artifactPointers.notes, ["notes/working.md"]);
    assert.deepEqual(completed.artifactPointers.out, [
      "out/claim-ledger.json",
      "out/final-report.md",
    ]);

    const artifacts = await artifactStore.listArtifacts(runId);
    assert.deepEqual(artifacts, [
      "notes/working.md",
      "out/claim-ledger.json",
      "out/final-report.md",
      "provenance.json",
      "report.md",
      "summary.json",
    ]);

    const report = (
      await artifactStore.readArtifact(runId, "report.md")
    ).toString("utf8");
    assert.match(report, /Freshness verdict: `passed`/);
    assert.match(report, /# Final Report/);
  });
});

test("executeResearchRun forces review when freshness fails for time-sensitive prompts", async () => {
  await withTempDir(async (dir) => {
    const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
    const artifactStore = new FileArtifactStore(path.join(dir, "artifacts"));
    const sourceTracker = new SourceTracker();
    const runId = "run-freshness-fail";
    const prompt = "What is the latest state of the market?";

    await createRunRecord({
      request: { prompt },
      executionMode: "hosted",
      metadataStore,
      runId,
    });

    const completed = await executeResearchRun({
      runId,
      request: { prompt },
      executionMode: "hosted",
      metadataStore,
      artifactStore,
      deps: makeDeps(dir, sourceTracker, async ({ workspaceRoot }) => {
        await fs.mkdir(path.join(workspaceRoot, "out"), { recursive: true });
        await fs.writeFile(
          path.join(workspaceRoot, "out", "final-report.md"),
          "Report body",
        );
        return {
          async invoke() {
            return {
              messages: [{ type: "ai", content: "fallback report text" }],
            };
          },
        };
      }),
    });

    assert.equal(completed.status, "awaiting_review");
    assert.equal(completed.reviewStatus, "pending");
    assert.equal(completed.freshnessVerdict, "failed");
  });
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

test("executeResearchRun passes provider configuration into agent construction", async () => {
  await withTempDir(async (dir) => {
    const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
    const artifactStore = new FileArtifactStore(path.join(dir, "artifacts"));
    const runId = "run-provider-config";
    const prompt = "Research something";
    let receivedArgs:
      | {
          workspaceRoot: string;
          sourceTracker: SourceTracker;
          model: string;
          modelProvider: "vertex" | "openai" | "anthropic";
          openAiApiKey?: string;
          anthropicApiKey?: string;
        }
      | undefined;

    await createRunRecord({
      request: { prompt },
      executionMode: "local",
      metadataStore,
      runId,
    });

    await executeResearchRun({
      runId,
      request: { prompt },
      executionMode: "local",
      metadataStore,
      artifactStore,
      deps: {
        config: {
          dataDir: dir,
          researchAgentModel: "claude-3-7-sonnet-latest",
          researchAgentModelProvider: "anthropic",
          openAiApiKey: undefined,
          anthropicApiKey: "sk-ant-test",
        },
        sourceTracker: new SourceTracker(),
        buildAgent: async (args) => {
          receivedArgs = args;
          await fs.mkdir(path.join(args.workspaceRoot, "out"), {
            recursive: true,
          });
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
        },
      },
    });

    assert.equal(receivedArgs?.modelProvider, "anthropic");
    assert.equal(receivedArgs?.model, "claude-3-7-sonnet-latest");
    assert.equal(receivedArgs?.anthropicApiKey, "sk-ant-test");
  });
});
