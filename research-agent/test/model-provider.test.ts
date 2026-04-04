import assert from "node:assert/strict";
import { test } from "vitest";

import { createResearchModel } from "../src/model-provider.js";

test("createResearchModel builds an OpenAI model when the provider is openai", async () => {
  const calls: Record<string, unknown>[] = [];

  const model = await createResearchModel(
    {
      researchAgentModelProvider: "openai",
      researchAgentModel: "gpt-4.1-mini",
      openAiApiKey: "sk-openai-test",
      openAiCodexAccessToken: undefined,
      openAiCodexAccountId: undefined,
      openAiCodexExpiresAt: undefined,
      openAiCodexRefreshToken: undefined,
      anthropicApiKey: undefined,
    },
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

test("createResearchModel builds an OpenAI Codex model with the Codex endpoint and account header", async () => {
  const calls: Record<string, unknown>[] = [];

  const model = await createResearchModel(
    {
      researchAgentModelProvider: "openai-codex",
      researchAgentModel: "gpt-5.4-codex",
      openAiApiKey: undefined,
      openAiCodexAccessToken: "codex-access-token",
      openAiCodexAccountId: "acct-codex",
      openAiCodexExpiresAt: undefined,
      openAiCodexRefreshToken: "codex-refresh-token",
      anthropicApiKey: undefined,
    },
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
    },
  ]);
  assert.deepEqual(model, { provider: "openai-codex" });
});

test("createResearchModel builds an Anthropic model when the provider is anthropic", async () => {
  const calls: Record<string, unknown>[] = [];

  const model = await createResearchModel(
    {
      researchAgentModelProvider: "anthropic",
      researchAgentModel: "claude-3-7-sonnet-latest",
      openAiApiKey: undefined,
      openAiCodexAccessToken: undefined,
      openAiCodexAccountId: undefined,
      openAiCodexExpiresAt: undefined,
      openAiCodexRefreshToken: undefined,
      anthropicApiKey: "sk-ant-test",
    },
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

test("createResearchModel keeps Vertex as the default provider behavior", async () => {
  const calls: Record<string, unknown>[] = [];

  const model = await createResearchModel(
    {
      researchAgentModelProvider: "vertex",
      researchAgentModel: "gemini-3.1-pro-preview",
      openAiApiKey: undefined,
      openAiCodexAccessToken: undefined,
      openAiCodexAccountId: undefined,
      openAiCodexExpiresAt: undefined,
      openAiCodexRefreshToken: undefined,
      anthropicApiKey: undefined,
    },
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
