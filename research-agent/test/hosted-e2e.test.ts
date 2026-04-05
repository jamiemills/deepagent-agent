import assert from "node:assert/strict";
import path from "node:path";

import { test } from "vitest";

import { ResearchApiClient } from "../src/api-client.js";
import { buildServer } from "../src/service/server.js";
import { FileArtifactStore } from "../src/storage/file-artifact-store.js";
import { FileMetadataStore } from "../src/storage/file-metadata-store.js";
import {
  createInlineTemporalClient,
  waitForRun,
  withTempDir,
} from "./integration-helpers.js";

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

async function readRequestBody(init: RequestInit): Promise<string | undefined> {
  if (typeof init.body === "string") {
    return init.body;
  }
  if (init.body) {
    return new Response(init.body).text();
  }
  return undefined;
}

function buildRequestHeaders(init: RequestInit): Record<string, string> {
  const requestHeaders: Record<string, string> = {};
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => {
      requestHeaders[key] = value;
    });
  }
  return requestHeaders;
}

function buildInjectOptions(args: {
  init: RequestInit;
  url: URL;
  body: string | undefined;
  headers: Record<string, string>;
}) {
  const injectOptions: {
    method: string;
    url: string;
    payload?: string;
    headers?: Record<string, string>;
  } = {
    method: args.init.method ?? "GET",
    url: `${args.url.pathname}${args.url.search}`,
  };

  if (args.body !== undefined) {
    injectOptions.payload = args.body;
  }
  if (Object.keys(args.headers).length > 0) {
    injectOptions.headers = args.headers;
  }

  return injectOptions;
}

function buildResponseHeaders(
  headers: Record<string, string | string[] | undefined>,
) {
  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        responseHeaders.append(key, item);
      }
      continue;
    }
    if (value !== undefined) {
      responseHeaders.set(key, String(value));
    }
  }
  return responseHeaders;
}

async function installAppFetch(app: Awaited<ReturnType<typeof buildServer>>) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(resolveFetchUrl(input));
    const body = await readRequestBody(init);
    const requestHeaders = buildRequestHeaders(init);
    const injectOptions = buildInjectOptions({
      init,
      url,
      body,
      headers: requestHeaders,
    });
    const response = (await app.inject(injectOptions as never)) as {
      body: string;
      statusCode: number;
      headers: Record<string, string | string[] | undefined>;
    };

    return new Response(response.body, {
      status: response.statusCode,
      headers: buildResponseHeaders(response.headers),
    });
  };

  return originalFetch;
}

async function assertHostedArtifacts(client: ResearchApiClient, runId: string) {
  const report = await client.getArtifact(runId, "report.md");
  assert.match(report, /Hosted Report/);
  assert.match(report, /Freshness verdict: `passed`/);

  const provenance = await client.getArtifact(runId, "provenance.json");
  const parsedProvenance = JSON.parse(provenance) as {
    sources: Array<{ url: string }>;
  };
  assert.equal(parsedProvenance.sources.length, 2);
  assert.equal(
    parsedProvenance.sources[0]?.url,
    "https://official.example.com/update",
  );
}

async function runHostedApiScenario(dir: string) {
  const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
  const artifactStore = new FileArtifactStore(path.join(dir, "artifacts"));
  const { temporalClient } = createInlineTemporalClient({
    dataDir: dir,
    metadataStore,
    artifactStore,
  });
  const app = await buildServer({
    metadataStore,
    artifactStore,
    temporalClient,
    taskQueue: "research-agent-test",
    workflow: Symbol("workflow"),
  });
  const originalFetch = await installAppFetch(app);

  try {
    const client = new ResearchApiClient("http://research-agent.test");
    const created = await client.createJob({
      prompt: "What is the latest Deep Agents JavaScript architecture update?",
      requestedBy: "integration-test",
    });
    assert.equal(created.status, "queued");
    assert.equal(created.executionMode, "hosted");

    const completed = await waitForRun(
      () => client.getJob(created.id),
      (record) => record.status === "completed",
    );
    assert.equal(completed.freshnessVerdict, "passed");
    assert.equal(completed.reviewStatus, "not_requested");
    assert.ok(completed.artifactPointers.report);
    assert.ok(completed.artifactPointers.provenance);
    assert.ok(completed.artifactPointers.summary);

    await assertHostedArtifacts(client, created.id);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
}

test("hosted API completes a background research job end to end and serves final artifacts over HTTP", async () => {
  await withTempDir(runHostedApiScenario);
});
