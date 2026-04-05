import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildResearchAgent } from "../src/agent.js";
import { loadConfig } from "../src/config.js";
import {
  createRunRecord,
  executeResearchRun,
} from "../src/core/research-runner.js";
import { SourceTracker } from "../src/core/source-tracker.js";
import type {
  ResearchModelConfig,
  ResearchModelProvider,
} from "../src/model-provider.js";
import { FileArtifactStore } from "../src/storage/file-artifact-store.js";
import { FileMetadataStore } from "../src/storage/file-metadata-store.js";
import { runCliCommand, withTempDir } from "./integration-helpers.js";

type LoadedConfig = ReturnType<typeof loadConfig>;

export type CapturedBuildAgentArgs = {
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
};

export async function withEnv(
  values: Record<string, string | undefined>,
  fn: () => Promise<void> | void,
) {
  const original = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    original.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of original.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export function makeResearchModelConfig(
  overrides: Partial<ResearchModelConfig> & {
    researchAgentModelProvider: ResearchModelProvider;
    researchAgentModel: string;
  },
): ResearchModelConfig {
  return {
    researchAgentModelProvider: overrides.researchAgentModelProvider,
    researchAgentModel: overrides.researchAgentModel,
    openAiApiKey: overrides.openAiApiKey,
    openAiCodexAccessToken: overrides.openAiCodexAccessToken,
    openAiCodexRefreshToken: overrides.openAiCodexRefreshToken,
    openAiCodexExpiresAt: overrides.openAiCodexExpiresAt,
    openAiCodexAccountId: overrides.openAiCodexAccountId,
    anthropicApiKey: overrides.anthropicApiKey,
  };
}

export async function captureBuildAgentArgs(
  config: ResearchModelConfig,
): Promise<CapturedBuildAgentArgs> {
  return withRunnerTempDir(async (dir) => {
    const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
    const artifactStore = new FileArtifactStore(path.join(dir, "artifacts"));
    const runId = `run-${config.researchAgentModelProvider}`;
    const prompt = `Research using ${config.researchAgentModelProvider}`;
    let receivedArgs: CapturedBuildAgentArgs | undefined;

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
          ...config,
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

    assert.ok(receivedArgs);
    return receivedArgs;
  });
}

export function loadLiveConfigSafely(): LoadedConfig | null {
  try {
    return loadConfig();
  } catch {
    return null;
  }
}

export function shouldRunLiveSmoke(
  provider: ResearchModelProvider,
  config: LoadedConfig | null,
): boolean {
  return (
    process.env["RUN_DEEPAGENT_SMOKE"] === "1" &&
    config?.researchAgentModelProvider === provider &&
    hasLiveCredentials(provider, config)
  );
}

export function shouldRunLiveCliLocal(
  provider: ResearchModelProvider,
  config: LoadedConfig | null,
): boolean {
  return (
    process.env["RUN_LIVE_CLI_LOCAL_TEST"] === "1" &&
    config?.researchAgentModelProvider === provider &&
    hasLiveCredentials(provider, config)
  );
}

export function requireLiveConfig(config: LoadedConfig | null) {
  assert.ok(config, "expected live config to be loaded");
  return config;
}

export async function runLiveAgentSmoke(config: NonNullable<LoadedConfig>) {
  await withTempDir(async (dir) => {
    const tracker = new SourceTracker();
    const agent = await buildResearchAgent({
      workspaceRoot: dir,
      sourceTracker: tracker,
      model: config.researchAgentModel,
      modelProvider: config.researchAgentModelProvider,
      openAiApiKey: config.openAiApiKey,
      openAiCodexAccessToken: config.openAiCodexAccessToken,
      openAiCodexRefreshToken: config.openAiCodexRefreshToken,
      openAiCodexExpiresAt: config.openAiCodexExpiresAt,
      openAiCodexAccountId: config.openAiCodexAccountId,
      anthropicApiKey: config.anthropicApiKey,
    });

    const result = await agent.invoke(
      {
        messages: [
          {
            role: "user",
            content:
              "Write a minimal markdown file to /out/final-report.md that says 'smoke test ok', and write an empty JSON array to /out/claim-ledger.json. Do not browse the web.",
          },
        ],
      },
      {
        recursionLimit: 40,
      },
    );

    assert.ok(Array.isArray(result.messages));
    const report = await fs.readFile(
      path.join(dir, "out", "final-report.md"),
      "utf8",
    );
    assert.match(report.toLowerCase(), /smoke test ok/);
  });
}

export async function runLiveCliLocalSmoke(config: NonNullable<LoadedConfig>) {
  await withTempDir(async (dir) => {
    const result = await runCliCommand(
      [
        "local",
        "Write a minimal markdown report to /out/final-report.md that says 'cli local smoke ok', write an empty JSON array to /out/claim-ledger.json, and do not browse the web.",
      ],
      {
        DATA_DIR: dir,
        RESEARCH_AGENT_MODEL: config.researchAgentModel,
      },
    );

    const record = JSON.parse(result.stdout) as {
      id: string;
      status: string;
      artifactPointers: { report?: string };
    };

    assert.equal(record.status, "completed");
    assert.ok(record.artifactPointers.report);

    const reportPath = path.join(dir, "artifacts", record.id, "report.md");
    const report = await fs.readFile(reportPath, "utf8");
    assert.match(report.toLowerCase(), /cli local smoke ok/);
  });
}

async function withRunnerTempDir<T>(fn: (dir: string) => Promise<T>) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "research-agent-runner-"),
  );
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function hasLiveCredentials(
  provider: ResearchModelProvider,
  config: NonNullable<LoadedConfig>,
) {
  switch (provider) {
    case "openai":
      return Boolean(config.openAiApiKey);
    case "openai-codex":
      return Boolean(config.openAiCodexAccessToken);
    case "anthropic":
      return Boolean(config.anthropicApiKey);
    default:
      return Boolean(
        config.googleApiKey ||
          config.googleApplicationCredentials ||
          config.googleCloudProject,
      );
  }
}
