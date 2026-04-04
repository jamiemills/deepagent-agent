import assert from "node:assert/strict";
import { test } from "vitest";

import { createResearchModel } from "../src/model-provider.js";

test("createResearchModel builds an OpenAI model when the provider is openai", async () => {
  const calls: Array<Record<string, unknown>> = [];

  const model = await createResearchModel(
    {
      researchAgentModelProvider: "openai",
      researchAgentModel: "gpt-4.1-mini",
      openAiApiKey: "sk-openai-test",
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
    },
  ]);
  assert.deepEqual(model, { provider: "openai" });
});

test("createResearchModel builds an Anthropic model when the provider is anthropic", async () => {
  const calls: Array<Record<string, unknown>> = [];

  const model = await createResearchModel(
    {
      researchAgentModelProvider: "anthropic",
      researchAgentModel: "claude-3-7-sonnet-latest",
      openAiApiKey: undefined,
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
  const calls: Array<Record<string, unknown>> = [];

  const model = await createResearchModel(
    {
      researchAgentModelProvider: "vertex",
      researchAgentModel: "gemini-3.1-pro-preview",
      openAiApiKey: undefined,
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
