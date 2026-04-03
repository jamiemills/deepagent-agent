import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildProvenanceManifest,
  buildSourceRecords,
} from "../src/core/provenance.js";

test("buildSourceRecords deduplicates by URL and upgrades fetched pages", () => {
  const sources = buildSourceRecords(
    [
      {
        query: "deep agents",
        observedAt: "2026-04-03T00:00:00.000Z",
        results: [
          {
            title: "Deep Agents Overview",
            url: "https://docs.langchain.com/oss/javascript/deepagents/overview",
            description: "Overview",
            language: "en",
            age: "2 days ago",
          },
        ],
      },
    ],
    [
      {
        url: "https://docs.langchain.com/oss/javascript/deepagents/overview",
        observedAt: "2026-04-03T00:01:00.000Z",
        contentType: "text/html",
        title: "Deep Agents Overview",
        lastModified: "Wed, 02 Apr 2026 12:00:00 GMT",
      },
    ],
  );

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.sourceOrigin, "fetched_page");
  assert.equal(sources[0]?.sourceType, "reference");
});

test("buildProvenanceManifest includes source and claim counts", () => {
  const manifest = buildProvenanceManifest({
    runId: "run-1",
    prompt: "Research Deep Agents",
    assessment: {
      sensitivity: "evergreen",
      verdict: "not_applicable",
      reasons: ["Evergreen prompt."],
      recentSourceCount: 0,
      datedSourceCount: 0,
    },
    sources: [],
    claimLedger: [{ claim: "A", sourceUrls: ["https://example.com"] }],
  });

  assert.equal(manifest.runId, "run-1");
  assert.equal(manifest.claimLedger.length, 1);
});
