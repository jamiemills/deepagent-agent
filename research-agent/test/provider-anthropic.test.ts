import assert from "node:assert/strict";
import { test } from "vitest";

import { loadConfig } from "../src/config.js";
import { createResearchModel } from "../src/model-provider.js";
import {
  captureBuildAgentArgs,
  loadLiveConfigSafely,
  makeResearchModelConfig,
  requireLiveConfig,
  runLiveAgentSmoke,
  runLiveCliLocalSmoke,
  shouldRunLiveCliLocal,
  shouldRunLiveSmoke,
  withEnv,
} from "./provider-test-helpers.js";

test("anthropic provider reads config from env", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "anthropic",
      RESEARCH_AGENT_MODEL: "claude-3-7-sonnet-latest",
      RESEARCH_AGENT_MODEL_ANTHROPIC: undefined,
      ANTHROPIC_API_KEY: "sk-ant-test",
      OPENAI_API_KEY: undefined,
      OPENAI_ACCESS_TOKEN: undefined,
      OPENAI_CODEX_ACCESS_TOKEN: undefined,
    },
    () => {
      const config = loadConfig();

      assert.equal(config.researchAgentModelProvider, "anthropic");
      assert.equal(config.researchAgentModel, "claude-3-7-sonnet-latest");
      assert.equal(config.anthropicApiKey, "sk-ant-test");
      assert.equal(config.openAiApiKey, undefined);
    },
  );
});

test("anthropic provider prefers its provider-specific model env var", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "anthropic",
      RESEARCH_AGENT_MODEL: "shared-model",
      RESEARCH_AGENT_MODEL_ANTHROPIC: "claude-3-7-sonnet-latest",
      ANTHROPIC_API_KEY: "sk-ant-test",
    },
    () => {
      const config = loadConfig();

      assert.equal(config.researchAgentModel, "claude-3-7-sonnet-latest");
    },
  );
});

test("anthropic provider requires ANTHROPIC_API_KEY", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "anthropic",
      RESEARCH_AGENT_MODEL_ANTHROPIC: undefined,
      ANTHROPIC_API_KEY: undefined,
      OPENAI_API_KEY: "sk-openai-test",
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /ANTHROPIC_API_KEY is required when RESEARCH_AGENT_MODEL_PROVIDER=anthropic/,
      );
    },
  );
});

test("anthropic provider builds Anthropic model options", async () => {
  const calls: Record<string, unknown>[] = [];

  const model = await createResearchModel(
    makeResearchModelConfig({
      researchAgentModelProvider: "anthropic",
      researchAgentModel: "claude-3-7-sonnet-latest",
      anthropicApiKey: "sk-ant-test",
    }),
    {
      createAnthropicModel: (options) => {
        calls.push(options);
        return { provider: "anthropic" } as never;
      },
    },
  );

  assert.deepEqual(calls, [
    {
      model: "claude-3-7-sonnet-latest",
      apiKey: "sk-ant-test",
      maxRetries: 2,
    },
  ]);
  assert.deepEqual(model, { provider: "anthropic" });
});

test("anthropic provider settings reach agent construction", async () => {
  const args = await captureBuildAgentArgs(
    makeResearchModelConfig({
      researchAgentModelProvider: "anthropic",
      researchAgentModel: "claude-3-7-sonnet-latest",
      anthropicApiKey: "sk-ant-test",
    }),
  );

  assert.equal(args.modelProvider, "anthropic");
  assert.equal(args.model, "claude-3-7-sonnet-latest");
  assert.equal(args.anthropicApiKey, "sk-ant-test");
});

const liveConfig = loadLiveConfigSafely();

(shouldRunLiveSmoke("anthropic", liveConfig) ? test : test.skip)(
  "anthropic provider deep agents smoke run works with live credentials",
  async () => {
    await runLiveAgentSmoke(requireLiveConfig(liveConfig));
  },
  120_000,
);

(shouldRunLiveCliLocal("anthropic", liveConfig) ? test : test.skip)(
  "anthropic provider CLI local mode works with live credentials",
  async () => {
    await runLiveCliLocalSmoke(requireLiveConfig(liveConfig));
  },
  120_000,
);
