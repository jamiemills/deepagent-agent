import assert from "node:assert/strict";
import { test } from "vitest";

import { createTemporalWorker } from "../src/temporal/worker.js";

test("createTemporalWorker wires Temporal connection, task queue, workflows path, and activities", async () => {
  const calls: Array<{
    address?: string;
    taskQueue?: string;
    workflowsPath?: string;
  }> = [];
  const fakeActivities = {
    async runHostedResearchJob() {
      return {} as never;
    },
  };

  const worker = await createTemporalWorker({
    config: {
      temporalAddress: "temporal.example:7233",
      temporalTaskQueue: "research-agent-q",
    } as never,
    activities: fakeActivities,
    connect: async (options) => {
      const address = options?.address;
      assert.equal(typeof address, "string");
      if (!address) {
        throw new Error("expected Temporal connection address");
      }
      calls.push({ address });
      return { connection: true } as never;
    },
    createWorker: async (options) => {
      const taskQueue = options?.taskQueue;
      const workflowsPath = options?.workflowsPath;
      assert.equal(typeof taskQueue, "string");
      assert.equal(typeof workflowsPath, "string");
      if (!(taskQueue && workflowsPath)) {
        throw new Error("expected Temporal worker options");
      }
      calls.push({
        taskQueue,
        workflowsPath,
      });
      return {
        async run() {
          // Intentional no-op for worker bootstrap testing.
        },
      } as never;
    },
  });

  assert.equal(calls[0]?.address, "temporal.example:7233");
  assert.equal(calls[1]?.taskQueue, "research-agent-q");
  assert.match(calls[1]?.workflowsPath ?? "", /workflows\.ts$/);
  assert.equal(typeof worker.run, "function");
});
