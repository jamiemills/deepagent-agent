import assert from "node:assert/strict";
import { test } from "vitest";

import { getLoadedEnvPath, loadConfig } from "../src/config.js";
import { withEnv } from "./provider-test-helpers.js";

test("config exposes the loaded env path and required defaults", async () => {
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
      assert.equal(typeof config.port, "number");
      assert.equal(typeof config.researchAgentModel, "string");
      assert.equal(
        ["vertex", "openai", "openai-codex", "anthropic"].includes(
          config.researchAgentModelProvider,
        ),
        true,
      );
    },
  );
});
