import assert from "node:assert/strict";
import { test } from "vitest";

import {
  completionPatch,
  createQueuedRunRecord,
  failurePatch,
  runningPatch,
} from "../src/core/run-records.js";

test("createQueuedRunRecord initializes queued run state", () => {
  const record = createQueuedRunRecord(
    {
      prompt: "What is the latest UK AI policy?",
      requestedBy: "jamie",
    },
    "hosted",
    "time_sensitive",
    "run-123",
  );

  assert.equal(record.id, "run-123");
  assert.equal(record.status, "queued");
  assert.equal(record.reviewStatus, "not_requested");
  assert.equal(record.freshnessSensitivity, "time_sensitive");
  assert.equal(record.freshnessVerdict, "warning");
  assert.deepEqual(record.artifactPointers, {});
});

test("runningPatch moves a run into running state", () => {
  const patch = runningPatch();
  assert.equal(patch.status, "running");
  assert.ok(patch.startedAt);
  assert.ok(patch.updatedAt);
});

test("completionPatch marks successful runs completed", () => {
  const patch = completionPatch({
    assessment: {
      sensitivity: "time_sensitive",
      verdict: "passed",
      reasons: ["Found recent dated sources."],
      recentSourceCount: 2,
      datedSourceCount: 2,
    },
    artifactPointers: {
      report: "report.md",
    },
    reportExcerpt: "hello",
  });

  assert.equal(patch.status, "completed");
  assert.equal(patch.reviewStatus, "not_requested");
  assert.equal(patch.freshnessVerdict, "passed");
  assert.equal(patch.reportExcerpt, "hello");
});

test("completionPatch puts failed freshness runs into review", () => {
  const patch = completionPatch({
    assessment: {
      sensitivity: "time_sensitive",
      verdict: "failed",
      reasons: ["No recent sources."],
      recentSourceCount: 0,
      datedSourceCount: 0,
    },
    artifactPointers: {},
    reportExcerpt: "hello",
  });

  assert.equal(patch.status, "awaiting_review");
  assert.equal(patch.reviewStatus, "pending");
});

test("failurePatch captures the error message", () => {
  const patch = failurePatch(new Error("boom"));
  assert.equal(patch.status, "failed");
  assert.equal(patch.errorMessage, "boom");
  assert.ok(patch.updatedAt);
  assert.ok(patch.completedAt);
});
