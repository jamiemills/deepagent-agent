import assert from "node:assert/strict";

import { test } from "vitest";

import { waitForRun } from "./integration-helpers.js";

test("waitForRun retries after transient load errors until the run completes", async () => {
  let attempts = 0;

  const completed = await waitForRun(
    async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error(
          'Failed to load job run-1: 404 {"error":"Run not found."}',
        );
      }

      return {
        id: "run-1",
        status: attempts >= 3 ? "completed" : "running",
      } as never;
    },
    (record) => record.status === "completed",
    500,
  );

  assert.equal(completed.status, "completed");
  assert.equal(attempts, 3);
});
