import assert from "node:assert/strict";
import { test } from "vitest";

import { createActivities } from "../src/temporal/activities.js";

test("createActivities routes hosted runs through executeResearchRun with retry-friendly settings", async () => {
  const calls: unknown[] = [];

  const activities = createActivities({
    config: {
      dataDir: "/tmp/research-agent",
    } as never,
    executeRun: async (args) => {
      calls.push(args);
      return {
        id: "run-1",
        prompt: args.request.prompt,
        executionMode: "hosted",
        status: "completed",
        reviewStatus: "not_requested",
        freshnessSensitivity: "evergreen",
        freshnessVerdict: "not_applicable",
        freshnessReasons: [],
        artifactPointers: {},
        createdAt: "2026-04-03T00:00:00.000Z",
        updatedAt: "2026-04-03T00:00:00.000Z",
      };
    },
  });

  const result = await activities.runHostedResearchJob({
    runId: "run-1",
    request: { prompt: "prompt" },
  });

  assert.equal(result.id, "run-1");
  assert.equal((calls[0] as { executionMode: string }).executionMode, "hosted");
  assert.equal(
    (calls[0] as { rethrowOnFailure: boolean }).rethrowOnFailure,
    true,
  );
});
