import assert from "node:assert/strict";
import { test } from "vitest";

import { getLoadedEnvPath, loadConfig } from "../src/config.js";
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

test("vertex provider exposes the loaded env path and defaults", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "vertex",
      OPENAI_API_KEY: undefined,
      OPENAI_ACCESS_TOKEN: undefined,
      OPENAI_CODEX_ACCESS_TOKEN: undefined,
      OPENAI_CODEX_REFRESH_TOKEN: undefined,
      OPENAI_CODEX_EXPIRES_AT: undefined,
      OPENAI_CODEX_ACCOUNT_ID: undefined,
      ANTHROPIC_API_KEY: undefined,
    },
    () => {
      const config = loadConfig();

      const loadedEnvPath = getLoadedEnvPath();
      assert.equal(
        loadedEnvPath === null || typeof loadedEnvPath === "string",
        true,
      );
      assert.equal(config.researchAgentModelProvider, "vertex");
      assert.equal(typeof config.port, "number");
      assert.equal(typeof config.researchAgentModel, "string");
    },
  );
});

test("vertex provider builds Vertex model options", async () => {
  const calls: Record<string, unknown>[] = [];

  const model = await createResearchModel(
    makeResearchModelConfig({
      researchAgentModelProvider: "vertex",
      researchAgentModel: "gemini-3.1-pro-preview",
    }),
    {
      createVertexModel: (options) => {
        calls.push(options);
        return { provider: "vertex" } as never;
      },
    },
  );

  assert.deepEqual(calls, [
    {
      model: "gemini-3.1-pro-preview",
      platformType: "gcp",
      maxRetries: 2,
    },
  ]);
  assert.deepEqual(model, { provider: "vertex" });
});

test("vertex provider settings reach agent construction", async () => {
  const args = await captureBuildAgentArgs(
    makeResearchModelConfig({
      researchAgentModelProvider: "vertex",
      researchAgentModel: "gemini-3.1-pro-preview",
    }),
  );

  assert.equal(args.modelProvider, "vertex");
  assert.equal(args.model, "gemini-3.1-pro-preview");
  assert.equal(args.openAiApiKey, undefined);
  assert.equal(args.anthropicApiKey, undefined);
});

const liveConfig = loadLiveConfigSafely();

(shouldRunLiveSmoke("vertex", liveConfig) ? test : test.skip)(
  "vertex provider deep agents smoke run works with live credentials",
  async () => {
    await runLiveAgentSmoke(requireLiveConfig(liveConfig));
  },
  120_000,
);

(shouldRunLiveCliLocal("vertex", liveConfig) ? test : test.skip)(
  "vertex provider CLI local mode works with live credentials",
  async () => {
    await runLiveCliLocalSmoke(requireLiveConfig(liveConfig));
  },
  120_000,
);
