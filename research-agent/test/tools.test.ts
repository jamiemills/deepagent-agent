import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

import { SourceTracker } from "../src/core/source-tracker.js";
import { createBraveSearchTool } from "../src/tools/brave-search.js";
import { createFetchUrlTool } from "../src/tools/fetch-url.js";

const originalFetch = globalThis.fetch;
const originalBraveKey = process.env["BRAVE_SEARCH_API_KEY"];

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBraveKey === undefined) {
    Reflect.deleteProperty(process.env, "BRAVE_SEARCH_API_KEY");
  } else {
    process.env["BRAVE_SEARCH_API_KEY"] = originalBraveKey;
  }
});

test("Brave search tool retries after 429 and records observations", async () => {
  process.env["BRAVE_SEARCH_API_KEY"] = "test-key";
  const tracker = new SourceTracker();
  const tool = createBraveSearchTool(tracker) as {
    invoke(input: unknown): Promise<string>;
  };
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("rate limited", {
        status: 429,
        statusText: "Too Many Requests",
      });
    }

    return new Response(
      JSON.stringify({
        web: {
          results: [
            {
              title: "Official Docs",
              url: "https://docs.example.com",
              description: "desc",
              language: "en",
              age: "2 days ago",
            },
          ],
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  const output = JSON.parse(await tool.invoke({ query: "deep agents" })) as {
    resultCount: number;
    results: Array<{ title: string }>;
  };

  assert.equal(calls, 2);
  assert.equal(output.resultCount, 1);
  assert.equal(output.results[0]?.title, "Official Docs");
  assert.equal(tracker.getSearchObservations().length, 1);
});

test("Brave search tool errors clearly when the API key is missing", async () => {
  Reflect.deleteProperty(process.env, "BRAVE_SEARCH_API_KEY");
  const tracker = new SourceTracker();
  const tool = createBraveSearchTool(tracker) as {
    invoke(input: unknown): Promise<string>;
  };

  await assert.rejects(
    () => tool.invoke({ query: "deep agents" }),
    /Missing BRAVE_SEARCH_API_KEY/,
  );
});

test("fetch_url strips html and records fetch metadata", async () => {
  const tracker = new SourceTracker();
  const tool = createFetchUrlTool(tracker) as {
    invoke(input: unknown): Promise<string>;
  };

  globalThis.fetch = (async () =>
    new Response(
      "<html><head><title>Sample</title><script>ignore()</script></head><body><h1>Hello</h1><p>World</p></body></html>",
      {
        status: 200,
        headers: {
          "content-type": "text/html",
          "last-modified": "Wed, 02 Apr 2026 12:00:00 GMT",
        },
      },
    )) as typeof fetch;

  const output = JSON.parse(
    await tool.invoke({ url: "https://example.com", maxChars: 500 }),
  ) as { title?: string; excerpt: string };

  assert.equal(output.title, "Sample");
  assert.match(output.excerpt, /Hello World/);
  assert.doesNotMatch(output.excerpt, /ignore/);
  assert.equal(tracker.getFetchObservations().length, 1);
});

test("fetch_url surfaces non-200 responses", async () => {
  const tracker = new SourceTracker();
  const tool = createFetchUrlTool(tracker) as {
    invoke(input: unknown): Promise<string>;
  };

  globalThis.fetch = (async () =>
    new Response("missing", {
      status: 404,
      statusText: "Not Found",
    })) as typeof fetch;

  await assert.rejects(
    () => tool.invoke({ url: "https://example.com" }),
    /Failed to fetch https:\/\/example.com: 404 Not Found missing/,
  );
});
