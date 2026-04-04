import assert from "node:assert/strict";
import { test } from "vitest";

import { createServiceApp } from "../src/service/start.js";

test("createServiceApp builds an app with the configured task queue without auto-listening", async () => {
  const temporalClient = {
    workflow: {
      async start() {
        return {};
      },
      getHandle() {
        return {
          async cancel() {
            // Stub cancellation for tests.
          },
        };
      },
    },
  };

  const { app, config } = await createServiceApp({
    config: {
      port: 3001,
      apiBaseUrl: "http://127.0.0.1:3001",
      dataDir: "/tmp/research-agent",
      temporalAddress: "localhost:7233",
      temporalNamespace: "default",
      temporalTaskQueue: "research-agent-test",
      braveSearchApiKey: undefined,
      researchAgentModel: "test-model",
      researchAgentModelProvider: "vertex",
      langsmithTracing: undefined,
      langsmithApiKey: undefined,
      langsmithProject: undefined,
      googleApiKey: undefined,
      googleCloudProject: undefined,
      googleCloudLocation: undefined,
      googleApplicationCredentials: undefined,
      openAiApiKey: undefined,
      openAiCodexAccessToken: undefined,
      openAiCodexRefreshToken: undefined,
      openAiCodexExpiresAt: undefined,
      openAiCodexAccountId: undefined,
      anthropicApiKey: undefined,
    },
    temporalClient: temporalClient as never,
  });

  assert.equal(config.temporalTaskQueue, "research-agent-test");
  assert.equal(typeof app.inject, "function");
  await app.close();
});
