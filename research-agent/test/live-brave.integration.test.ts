import assert from "node:assert/strict";
import { test } from "vitest";

const runLiveBrave = process.env["RUN_LIVE_BRAVE_TESTS"] === "1";

(runLiveBrave ? test : test.skip)(
  "live Brave Search API request succeeds with BRAVE_SEARCH_API_KEY",
  async () => {
    assert.ok(
      process.env["BRAVE_SEARCH_API_KEY"],
      "BRAVE_SEARCH_API_KEY must be set",
    );
    const braveSearchApiKey = process.env["BRAVE_SEARCH_API_KEY"];

    const response = await fetch(
      "https://api.search.brave.com/res/v1/web/search?q=deepagents&count=1&search_lang=en&country=us",
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": braveSearchApiKey,
        },
      },
    );

    assert.equal(response.ok, true);
    const body = (await response.json()) as {
      type?: string;
      web?: { results?: unknown[] };
    };

    assert.equal(body.type, "search");
    assert.ok(Array.isArray(body.web?.results));
  },
);
