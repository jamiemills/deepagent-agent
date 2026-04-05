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

test("openai provider reads config from env", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai",
      RESEARCH_AGENT_MODEL: "gpt-4.1-mini",
      RESEARCH_AGENT_MODEL_OPENAI: undefined,
      OPENAI_API_KEY: "sk-openai-test",
      OPENAI_ACCESS_TOKEN: undefined,
      OPENAI_CODEX_ACCESS_TOKEN: undefined,
      ANTHROPIC_API_KEY: undefined,
    },
    () => {
      const config = loadConfig();

      assert.equal(config.researchAgentModelProvider, "openai");
      assert.equal(config.researchAgentModel, "gpt-4.1-mini");
      assert.equal(config.openAiApiKey, "sk-openai-test");
      assert.equal(config.openAiCodexAccessToken, undefined);
    },
  );
});

test("openai provider prefers its provider-specific model env var", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai",
      RESEARCH_AGENT_MODEL: "shared-model",
      RESEARCH_AGENT_MODEL_OPENAI: "gpt-4.1-mini",
      OPENAI_API_KEY: "sk-openai-test",
    },
    () => {
      const config = loadConfig();

      assert.equal(config.researchAgentModel, "gpt-4.1-mini");
    },
  );
});

test("openai provider requires OPENAI_API_KEY", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: undefined,
      RESEARCH_AGENT_MODEL_OPENAI: undefined,
      OPENAI_ACCESS_TOKEN: undefined,
      OPENAI_CODEX_ACCESS_TOKEN: "codex-access-token",
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /OPENAI_API_KEY is required when RESEARCH_AGENT_MODEL_PROVIDER=openai/,
      );
    },
  );
});

test("openai provider builds standard OpenAI model options", async () => {
  const calls: Record<string, unknown>[] = [];

  const model = await createResearchModel(
    makeResearchModelConfig({
      researchAgentModelProvider: "openai",
      researchAgentModel: "gpt-4.1-mini",
      openAiApiKey: "sk-openai-test",
    }),
    {
      createOpenAIModel: (options) => {
        calls.push(options);
        return { provider: "openai" } as never;
      },
    },
  );

  assert.deepEqual(calls, [
    {
      model: "gpt-4.1-mini",
      apiKey: "sk-openai-test",
      maxRetries: 2,
      useResponsesApi: true,
    },
  ]);
  assert.deepEqual(model, { provider: "openai" });
});

test("openai provider settings reach agent construction", async () => {
  const args = await captureBuildAgentArgs(
    makeResearchModelConfig({
      researchAgentModelProvider: "openai",
      researchAgentModel: "gpt-4.1-mini",
      openAiApiKey: "sk-openai-test",
    }),
  );

  assert.equal(args.modelProvider, "openai");
  assert.equal(args.model, "gpt-4.1-mini");
  assert.equal(args.openAiApiKey, "sk-openai-test");
  assert.equal(args.openAiCodexAccessToken, undefined);
});

const liveConfig = loadLiveConfigSafely();

(shouldRunLiveSmoke("openai", liveConfig) ? test : test.skip)(
  "openai provider deep agents smoke run works with live credentials",
  async () => {
    await runLiveAgentSmoke(requireLiveConfig(liveConfig));
  },
  120_000,
);

(shouldRunLiveCliLocal("openai", liveConfig) ? test : test.skip)(
  "openai provider CLI local mode works with live credentials",
  async () => {
    await runLiveCliLocalSmoke(requireLiveConfig(liveConfig));
  },
  120_000,
);
