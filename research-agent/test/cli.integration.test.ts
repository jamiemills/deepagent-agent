import assert from "node:assert/strict";

import { test } from "vitest";

import type { ResearchJobRecord } from "../src/core/types.js";
import {
  runCliCommand,
  waitForRun,
  withTempDir,
  writeCliMockFetchModule,
} from "./integration-helpers.js";

test("spawned CLI can submit, poll, review, and fetch artifacts against the hosted API contract", async () => {
  await withTempDir(async (dir) => {
    const mockFetchModule = await writeCliMockFetchModule(dir);
    const env = {
      RESEARCH_API_BASE_URL: "http://mock.test",
      DATA_DIR: dir,
      MOCK_API_DATA_DIR: dir,
      BUN_PRELOAD_MODULE: mockFetchModule,
    };

    const submit = await runCliCommand(
      [
        "submit",
        "What is the latest Deep Agents JavaScript architecture update?",
      ],
      env,
    );
    const created = JSON.parse(submit.stdout) as ResearchJobRecord;
    assert.equal(created.status, "queued");
    assert.equal(created.executionMode, "hosted");

    const completed = await waitForRun(
      async () => {
        const status = await runCliCommand(["status", created.id], env);
        return JSON.parse(status.stdout) as ResearchJobRecord;
      },
      (record) => record.status === "completed",
    );

    assert.equal(completed.reviewStatus, "not_requested");
    assert.equal(completed.freshnessVerdict, "passed");

    const review = await runCliCommand(
      ["review", created.id, "approved", "checked"],
      env,
    );
    const reviewed = JSON.parse(review.stdout) as ResearchJobRecord;
    assert.equal(reviewed.reviewStatus, "approved");
    assert.equal(reviewed.status, "completed");

    const artifact = await runCliCommand(
      ["artifact", created.id, "report.md"],
      env,
    );
    assert.match(artifact.stdout, /Hosted Report/);
    assert.match(artifact.stdout, /Freshness verdict: `passed`/);
  });
}, 30_000);
