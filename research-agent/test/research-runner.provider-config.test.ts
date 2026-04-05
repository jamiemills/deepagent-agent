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

type AgentArgs = {
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
};

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

async function createQueuedRun(args: {
  metadataStore: FileMetadataStore;
  runId: string;
  prompt: string;
}) {
  await createRunRecord({
    request: { prompt: args.prompt },
    executionMode: "local",
    metadataStore: args.metadataStore,
    runId: args.runId,
  });
}

async function writeFinalReport(workspaceRoot: string) {
  await fs.mkdir(path.join(workspaceRoot, "out"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, "out", "final-report.md"),
    "Report body",
  );
}

function createCapturingBuildAgent(received: { current?: AgentArgs }) {
  return async (args: AgentArgs) => {
    received.current = args;
    await writeFinalReport(args.workspaceRoot);
    return {
      async invoke() {
        return {
          messages: [{ type: "ai", content: "fallback report text" }],
        };
      },
    };
  };
}

async function runProviderScenario(args: {
  dir: string;
  runId: string;
  prompt: string;
  config: {
    dataDir: string;
    researchAgentModel: string;
    researchAgentModelProvider: "anthropic" | "openai-codex";
    openAiApiKey: string | undefined;
    openAiCodexAccessToken: string | undefined;
    openAiCodexRefreshToken: string | undefined;
    openAiCodexExpiresAt: number | undefined;
    openAiCodexAccountId: string | undefined;
    anthropicApiKey: string | undefined;
  };
}) {
  const metadataStore = new FileMetadataStore(path.join(args.dir, "metadata"));
  const artifactStore = new FileArtifactStore(path.join(args.dir, "artifacts"));
  const received: { current?: AgentArgs } = {};

  await createQueuedRun({
    metadataStore,
    runId: args.runId,
    prompt: args.prompt,
  });
  await executeResearchRun({
    runId: args.runId,
    request: { prompt: args.prompt },
    executionMode: "local",
    metadataStore,
    artifactStore,
    deps: {
      config: args.config,
      sourceTracker: new SourceTracker(),
      buildAgent: createCapturingBuildAgent(received),
    },
  });

  return received.current;
}

test("executeResearchRun passes provider configuration into agent construction", async () => {
  await withTempDir(async (dir) => {
    const receivedArgs = await runProviderScenario({
      dir,
      runId: "run-provider-config",
      prompt: "Research something",
      config: {
        dataDir: dir,
        researchAgentModel: "claude-3-7-sonnet-latest",
        researchAgentModelProvider: "anthropic",
        openAiApiKey: undefined,
        openAiCodexAccessToken: undefined,
        openAiCodexRefreshToken: undefined,
        openAiCodexExpiresAt: undefined,
        openAiCodexAccountId: undefined,
        anthropicApiKey: "sk-ant-test",
      },
    });

    assert.equal(receivedArgs?.modelProvider, "anthropic");
    assert.equal(receivedArgs?.model, "claude-3-7-sonnet-latest");
    assert.equal(receivedArgs?.anthropicApiKey, "sk-ant-test");
  });
});

test("executeResearchRun passes OpenAI Codex OAuth settings into agent construction", async () => {
  await withTempDir(async (dir) => {
    const receivedArgs = await runProviderScenario({
      dir,
      runId: "run-openai-codex-token",
      prompt: "Research something",
      config: {
        dataDir: dir,
        researchAgentModel: "gpt-5.4-codex",
        researchAgentModelProvider: "openai-codex",
        openAiApiKey: undefined,
        openAiCodexAccessToken: "codex-access-token",
        openAiCodexRefreshToken: "codex-refresh-token",
        openAiCodexExpiresAt: 1746230400000,
        openAiCodexAccountId: "acct-codex",
        anthropicApiKey: undefined,
      },
    });

    assert.equal(receivedArgs?.modelProvider, "openai-codex");
    assert.equal(receivedArgs?.model, "gpt-5.4-codex");
    assert.equal(receivedArgs?.openAiCodexAccessToken, "codex-access-token");
    assert.equal(receivedArgs?.openAiCodexRefreshToken, "codex-refresh-token");
    assert.equal(receivedArgs?.openAiCodexExpiresAt, 1746230400000);
    assert.equal(receivedArgs?.openAiCodexAccountId, "acct-codex");
    assert.equal(receivedArgs?.openAiApiKey, undefined);
  });
});
