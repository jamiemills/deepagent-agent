import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

import { ResearchApiClient } from "../src/api-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createRunResponse() {
  return new Response(
    JSON.stringify({
      id: "run-1",
      prompt: "prompt",
      executionMode: "hosted",
      status: "queued",
      reviewStatus: "not_requested",
      freshnessSensitivity: "evergreen",
      freshnessVerdict: "not_applicable",
      freshnessReasons: [],
      artifactPointers: {},
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z",
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

function captureCall(input: RequestInfo | URL, init?: RequestInit) {
  const call: { url: string; method: string; body?: string | undefined } = {
    url: String(input),
    method: init?.method ?? "GET",
  };
  if (typeof init?.body === "string") {
    call.body = init.body;
  }
  return call;
}

function assertRecordedCalls(
  calls: Array<{ url: string; method: string; body?: string | undefined }>,
) {
  const createCall = calls[0];
  const getCall = calls[1];
  const cancelCall = calls[2];
  const reviewCall = calls[3];

  assert.ok(createCall);
  assert.ok(getCall);
  assert.ok(cancelCall);
  assert.ok(reviewCall);

  assert.equal(createCall.url, "http://127.0.0.1:3001/research-jobs");
  assert.equal(createCall.method, "POST");
  assert.equal(getCall.url, "http://127.0.0.1:3001/research-jobs/run-1");
  assert.equal(getCall.method, "GET");
  assert.equal(
    cancelCall.url,
    "http://127.0.0.1:3001/research-jobs/run-1/cancel",
  );
  assert.equal(cancelCall.method, "POST");
  assert.equal(
    reviewCall.url,
    "http://127.0.0.1:3001/research-jobs/run-1/review",
  );
  assert.equal(reviewCall.method, "POST");
  assert.match(reviewCall.body ?? "", /approved/);
}

test("ResearchApiClient issues the expected requests and parses responses", async () => {
  const calls: Array<{
    url: string;
    method: string;
    body?: string | undefined;
  }> = [];

  globalThis.fetch = (async (input, init) => {
    calls.push(captureCall(input, init));
    return createRunResponse();
  }) as typeof fetch;

  const client = new ResearchApiClient("http://127.0.0.1:3001");

  await client.createJob({ prompt: "prompt" });
  await client.getJob("run-1");
  await client.cancelJob("run-1");
  await client.reviewJob("run-1", "approved", "looks good");

  globalThis.fetch = (async () =>
    new Response("artifact-body", { status: 200 })) as typeof fetch;
  const artifact = await client.getArtifact("run-1", "report.md");

  assert.equal(artifact, "artifact-body");
  assertRecordedCalls(calls);
});

test("ResearchApiClient surfaces error responses", async () => {
  globalThis.fetch = (async () =>
    new Response("bad", { status: 500 })) as typeof fetch;
  const client = new ResearchApiClient("http://127.0.0.1:3001");

  await assert.rejects(
    () => client.getJob("run-1"),
    /Failed to load job run-1: 500 bad/,
  );
});
