import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  contentToText,
  decorateReportMarkdown,
  extractFinalAiText,
  readCanonicalReport,
  readClaimLedger,
} from "../src/core/report.js";

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "research-agent-report-"),
  );
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("contentToText and extractFinalAiText normalize message content", () => {
  assert.equal(contentToText("hello"), "hello");
  assert.equal(contentToText([{ text: "a" }, { text: "b" }, "c"]), "a\nb\nc");

  const text = extractFinalAiText([
    { type: "human", content: "ignore" },
    { type: "ai", content: [{ text: "final answer" }] },
  ]);
  assert.equal(text, "final answer");
});

test("readCanonicalReport prefers workspace report and falls back otherwise", async () => {
  await withTempDir(async (dir) => {
    await fs.mkdir(path.join(dir, "out"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "out", "final-report.md"),
      "workspace report",
    );

    assert.equal(
      await readCanonicalReport(dir, "fallback"),
      "workspace report",
    );
    assert.equal(
      await readCanonicalReport(path.join(dir, "missing"), "fallback"),
      "fallback",
    );
  });
});

test("readClaimLedger returns parsed claims or an empty array", async () => {
  await withTempDir(async (dir) => {
    await fs.mkdir(path.join(dir, "out"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "out", "claim-ledger.json"),
      JSON.stringify([{ claim: "A", sourceUrls: ["https://example.com"] }]),
    );

    assert.deepEqual(await readClaimLedger(dir), [
      { claim: "A", sourceUrls: ["https://example.com"] },
    ]);
    assert.deepEqual(await readClaimLedger(path.join(dir, "missing")), []);
  });
});

test("decorateReportMarkdown prefixes run and freshness metadata", () => {
  const markdown = decorateReportMarkdown({
    reportBody: "## Findings\n\nBody",
    record: {
      id: "run-1",
      executionMode: "hosted",
      reviewStatus: "pending",
    },
    assessment: {
      sensitivity: "time_sensitive",
      verdict: "warning",
      reasons: ["Only one recent source."],
      recentSourceCount: 1,
      datedSourceCount: 1,
    },
  });

  assert.match(markdown, /Run ID: `run-1`/);
  assert.match(markdown, /Freshness verdict: `warning`/);
  assert.match(markdown, /## Agent Report/);
  assert.match(markdown, /## Findings/);
});
