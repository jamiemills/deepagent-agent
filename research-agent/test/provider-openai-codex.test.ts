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

test("openai-codex provider reads config from env", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai-codex",
      RESEARCH_AGENT_MODEL: "gpt-5.4-codex",
      RESEARCH_AGENT_MODEL_OPENAI_CODEX: undefined,
      OPENAI_API_KEY: undefined,
      OPENAI_ACCESS_TOKEN: undefined,
      OPENAI_CODEX_ACCESS_TOKEN: "codex-access-token",
      OPENAI_CODEX_REFRESH_TOKEN: "codex-refresh-token",
      OPENAI_CODEX_EXPIRES_AT: "1746230400000",
      OPENAI_CODEX_ACCOUNT_ID: "acct-codex",
      ANTHROPIC_API_KEY: undefined,
    },
    () => {
      const config = loadConfig();

      assert.equal(config.researchAgentModelProvider, "openai-codex");
      assert.equal(config.researchAgentModel, "gpt-5.4-codex");
      assert.equal(config.openAiCodexAccessToken, "codex-access-token");
      assert.equal(config.openAiCodexRefreshToken, "codex-refresh-token");
      assert.equal(config.openAiCodexExpiresAt, 1746230400000);
      assert.equal(config.openAiCodexAccountId, "acct-codex");
      assert.equal(config.openAiApiKey, undefined);
    },
  );
});

test("openai-codex provider prefers its provider-specific model env var", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai-codex",
      RESEARCH_AGENT_MODEL: "shared-model",
      RESEARCH_AGENT_MODEL_OPENAI_CODEX: "gpt-5.2",
      OPENAI_CODEX_ACCESS_TOKEN: "codex-access-token",
    },
    () => {
      const config = loadConfig();

      assert.equal(config.researchAgentModel, "gpt-5.2");
    },
  );
});

test("openai-codex provider maps OPENAI_ACCESS_TOKEN as a deprecated alias", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai-codex",
      RESEARCH_AGENT_MODEL: "gpt-5.4-codex",
      RESEARCH_AGENT_MODEL_OPENAI_CODEX: undefined,
      OPENAI_API_KEY: undefined,
      OPENAI_ACCESS_TOKEN: "legacy-codex-token",
      OPENAI_CODEX_ACCESS_TOKEN: undefined,
      OPENAI_CODEX_REFRESH_TOKEN: undefined,
      OPENAI_CODEX_EXPIRES_AT: undefined,
      OPENAI_CODEX_ACCOUNT_ID: undefined,
    },
    () => {
      const config = loadConfig();

      assert.equal(config.researchAgentModelProvider, "openai-codex");
      assert.equal(config.openAiCodexAccessToken, "legacy-codex-token");
      assert.equal(config.openAiApiKey, undefined);
    },
  );
});

test("openai-codex provider requires OPENAI_CODEX_ACCESS_TOKEN", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai-codex",
      RESEARCH_AGENT_MODEL_OPENAI_CODEX: undefined,
      OPENAI_API_KEY: undefined,
      OPENAI_ACCESS_TOKEN: undefined,
      OPENAI_CODEX_ACCESS_TOKEN: undefined,
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /OPENAI_CODEX_ACCESS_TOKEN is required when RESEARCH_AGENT_MODEL_PROVIDER=openai-codex/,
      );
    },
  );
});

test("openai-codex provider builds Codex model options", async () => {
  const calls: Record<string, unknown>[] = [];

  const model = await createResearchModel(
    makeResearchModelConfig({
      researchAgentModelProvider: "openai-codex",
      researchAgentModel: "gpt-5.4-codex",
      openAiCodexAccessToken: "codex-access-token",
      openAiCodexRefreshToken: "codex-refresh-token",
      openAiCodexAccountId: "acct-codex",
    }),
    {
      createOpenAICodexModel: (options) => {
        calls.push(options);
        return { provider: "openai-codex" } as never;
      },
    },
  );

  assert.deepEqual(calls, [
    {
      model: "gpt-5.4-codex",
      apiKey: "codex-access-token",
      maxRetries: 2,
      useResponsesApi: true,
      configuration: {
        baseURL: "https://chatgpt.com/backend-api/codex",
        defaultHeaders: {
          "ChatGPT-Account-Id": "acct-codex",
        },
      },
      streaming: true,
    },
  ]);
  assert.deepEqual(model, { provider: "openai-codex" });
});

test("openai-codex provider settings reach agent construction", async () => {
  const args = await captureBuildAgentArgs(
    makeResearchModelConfig({
      researchAgentModelProvider: "openai-codex",
      researchAgentModel: "gpt-5.4-codex",
      openAiCodexAccessToken: "codex-access-token",
      openAiCodexRefreshToken: "codex-refresh-token",
      openAiCodexExpiresAt: 1746230400000,
      openAiCodexAccountId: "acct-codex",
    }),
  );

  assert.equal(args.modelProvider, "openai-codex");
  assert.equal(args.model, "gpt-5.4-codex");
  assert.equal(args.openAiCodexAccessToken, "codex-access-token");
  assert.equal(args.openAiCodexRefreshToken, "codex-refresh-token");
  assert.equal(args.openAiCodexExpiresAt, 1746230400000);
  assert.equal(args.openAiCodexAccountId, "acct-codex");
  assert.equal(args.openAiApiKey, undefined);
});

const liveConfig = loadLiveConfigSafely();

(shouldRunLiveSmoke("openai-codex", liveConfig) ? test : test.skip)(
  "openai-codex provider deep agents smoke run works with live credentials",
  async () => {
    await runLiveAgentSmoke(requireLiveConfig(liveConfig));
  },
  120_000,
);

(shouldRunLiveCliLocal("openai-codex", liveConfig) ? test : test.skip)(
  "openai-codex provider CLI local mode works with live credentials",
  async () => {
    await runLiveCliLocalSmoke(requireLiveConfig(liveConfig));
  },
  120_000,
);
