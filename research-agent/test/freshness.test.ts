import assert from "node:assert/strict";
import { test } from "vitest";

import {
  classifyFreshnessSensitivity,
  evaluateFreshness,
  parseAgeTextToDays,
} from "../src/core/freshness.js";
import type { SourceRecord } from "../src/core/types.js";

test("classifies time-sensitive prompts", () => {
  assert.equal(
    classifyFreshnessSensitivity("What is the latest UK AI regulation update?"),
    "time_sensitive",
  );
  assert.equal(
    classifyFreshnessSensitivity("Explain the history of the TCP/IP model."),
    "evergreen",
  );
});

test("parses human-readable age strings", () => {
  assert.equal(parseAgeTextToDays("2 days ago"), 2);
  assert.equal(parseAgeTextToDays("3 weeks ago"), 21);
  assert.equal(parseAgeTextToDays("1 year ago"), 365);
  assert.equal(parseAgeTextToDays(undefined), null);
});

test("passes freshness when enough recent sources exist", () => {
  const sources: SourceRecord[] = [
    {
      url: "https://example.gov/a",
      title: "A",
      domain: "example.gov",
      sourceOrigin: "search_result",
      sourceType: "official",
      discoveredAt: new Date().toISOString(),
      ageText: "2 days ago",
      isPrimaryCandidate: true,
    },
    {
      url: "https://news.example.com/b",
      title: "B",
      domain: "news.example.com",
      sourceOrigin: "search_result",
      sourceType: "news",
      discoveredAt: new Date().toISOString(),
      ageText: "5 days ago",
      isPrimaryCandidate: false,
    },
  ];

  const assessment = evaluateFreshness("time_sensitive", sources);
  assert.equal(assessment.verdict, "passed");
});

test("returns not_applicable for evergreen prompts", () => {
  const assessment = evaluateFreshness("evergreen", []);
  assert.equal(assessment.verdict, "not_applicable");
});

test("returns warning when only stale dated evidence exists", () => {
  const sources: SourceRecord[] = [
    {
      url: "https://example.com/a",
      title: "A",
      domain: "example.com",
      sourceOrigin: "search_result",
      sourceType: "news",
      discoveredAt: new Date().toISOString(),
      ageText: "90 days ago",
      isPrimaryCandidate: false,
    },
  ];

  const assessment = evaluateFreshness("time_sensitive", sources);
  assert.equal(assessment.verdict, "warning");
});
