import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import type { ResearchJobRecord } from "../src/core/types.js";
import { FileArtifactStore } from "../src/storage/file-artifact-store.js";
import { FileMetadataStore } from "../src/storage/file-metadata-store.js";

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "research-agent-test-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function sampleRecord(): ResearchJobRecord {
  return {
    id: "run-1",
    prompt: "Research prompt",
    executionMode: "local",
    status: "queued",
    reviewStatus: "not_requested",
    freshnessSensitivity: "evergreen",
    freshnessVerdict: "not_applicable",
    freshnessReasons: [],
    artifactPointers: { report: "report.md" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test("FileMetadataStore creates, reads, and updates runs without clobbering undefined fields", async () => {
  await withTempDir(async (dir) => {
    const store = new FileMetadataStore(path.join(dir, "metadata"));
    const record = sampleRecord();

    await store.createRun(record);
    const created = await store.getRun(record.id);
    assert.deepEqual(created, record);

    const updated = await store.updateRun(record.id, {
      status: "completed",
      errorMessage: undefined,
      artifactPointers: {
        provenance: "provenance.json",
      },
    });

    assert.equal(updated.status, "completed");
    assert.equal(updated.errorMessage, undefined);
    assert.deepEqual(updated.artifactPointers, {
      report: "report.md",
      provenance: "provenance.json",
    });
  });
});

test("FileArtifactStore writes, copies, reads, lists, and sanitizes artifact names", async () => {
  await withTempDir(async (dir) => {
    const store = new FileArtifactStore(path.join(dir, "artifacts"));
    const runId = "run-2";

    const written = await store.writeText(runId, "../report.md", "# Report");
    assert.equal(written, "report.md");

    const sourcePath = path.join(dir, "source.txt");
    await fs.writeFile(sourcePath, "notes");
    const copied = await store.copyFromFile(
      runId,
      "notes/work.txt",
      sourcePath,
    );
    assert.equal(copied, "notes/work.txt");

    const report = await store.readArtifact(runId, "report.md");
    assert.equal(report.toString("utf8"), "# Report");

    const artifacts = await store.listArtifacts(runId);
    assert.deepEqual(artifacts, ["notes/work.txt", "report.md"]);
  });
});
