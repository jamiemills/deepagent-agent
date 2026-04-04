import assert from "node:assert/strict";
import { test } from "vitest";

import { getLoadedEnvPath, loadConfig } from "../src/config.js";

async function withEnv(
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

test("config reads OpenAI provider settings from env", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai",
      RESEARCH_AGENT_MODEL: "gpt-4.1-mini",
      OPENAI_API_KEY: "sk-openai-test",
      ANTHROPIC_API_KEY: undefined,
    },
    () => {
      const config = loadConfig();

      assert.equal(config.researchAgentModelProvider, "openai");
      assert.equal(config.researchAgentModel, "gpt-4.1-mini");
      assert.equal(config.openAiApiKey, "sk-openai-test");
    },
  );
});

test("config reads OpenAI Codex provider settings from env", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai-codex",
      RESEARCH_AGENT_MODEL: "gpt-5.4-codex",
      OPENAI_API_KEY: undefined,
      OPENAI_ACCESS_TOKEN: undefined,
      OPENAI_CODEX_ACCESS_TOKEN: "codex-access-token",
      OPENAI_CODEX_REFRESH_TOKEN: "codex-refresh-token",
      OPENAI_CODEX_EXPIRES_AT: "1746230400000",
      OPENAI_CODEX_ACCOUNT_ID: "acct-codex",
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

test("config maps OPENAI_ACCESS_TOKEN to the Codex provider as a deprecated alias", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai-codex",
      RESEARCH_AGENT_MODEL: "gpt-5.4-codex",
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

test("config reads Anthropic provider settings from env", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "anthropic",
      RESEARCH_AGENT_MODEL: "claude-3-7-sonnet-latest",
      ANTHROPIC_API_KEY: "sk-ant-test",
      OPENAI_API_KEY: undefined,
    },
    () => {
      const config = loadConfig();

      assert.equal(config.researchAgentModelProvider, "anthropic");
      assert.equal(config.researchAgentModel, "claude-3-7-sonnet-latest");
      assert.equal(config.anthropicApiKey, "sk-ant-test");
    },
  );
});

test("config rejects an OpenAI provider selection without an API key", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: undefined,
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

test("config rejects an OpenAI Codex provider selection without an OAuth token", async () => {
  await withEnv(
    {
      RESEARCH_AGENT_MODEL_PROVIDER: "openai-codex",
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
