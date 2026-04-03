import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import type { ResearchJobRecord } from "../src/core/types.js";
import { type TemporalClientLike, buildServer } from "../src/service/server.js";
import { FileArtifactStore } from "../src/storage/file-artifact-store.js";
import { FileMetadataStore } from "../src/storage/file-metadata-store.js";

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "research-agent-server-"),
  );
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function sampleRecord(id: string): ResearchJobRecord {
  return {
    id,
    prompt: "prompt",
    executionMode: "hosted",
    status: "queued",
    reviewStatus: "not_requested",
    freshnessSensitivity: "evergreen",
    freshnessVerdict: "not_applicable",
    freshnessReasons: [],
    artifactPointers: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test("buildServer supports create, get, review, cancel, and artifact retrieval", async () => {
  await withTempDir(async (dir) => {
    const metadataStore = new FileMetadataStore(path.join(dir, "metadata"));
    const artifactStore = new FileArtifactStore(path.join(dir, "artifacts"));
    const started: Array<{ workflowId: string; taskQueue: string }> = [];
    const cancelled: string[] = [];

    const temporalClient: TemporalClientLike = {
      workflow: {
        async start(_workflow, options) {
          started.push({
            workflowId: options.workflowId,
            taskQueue: options.taskQueue,
          });
          return {};
        },
        getHandle(workflowId: string) {
          return {
            async cancel() {
              cancelled.push(workflowId);
            },
          };
        },
      },
    };

    const app = await buildServer({
      metadataStore,
      artifactStore,
      temporalClient,
      taskQueue: "research-agent",
      workflow: Symbol("workflow"),
    });

    await artifactStore.writeText("artifact-run", "report.md", "# Report");
    await metadataStore.createRun(sampleRecord("artifact-run"));

    const createResponse = await app.inject({
      method: "POST",
      url: "/research-jobs",
      payload: {
        prompt: "What is the latest market update?",
        requestedBy: "jamie",
      },
    });
    assert.equal(createResponse.statusCode, 202);
    const created = createResponse.json() as ResearchJobRecord;
    assert.equal(created.status, "queued");
    assert.equal(started.length, 1);
    assert.equal(started[0]?.workflowId, created.id);

    const getResponse = await app.inject({
      method: "GET",
      url: `/research-jobs/${created.id}`,
    });
    assert.equal(getResponse.statusCode, 200);

    const reviewResponse = await app.inject({
      method: "POST",
      url: `/research-jobs/${created.id}/review`,
      payload: {
        decision: "approved",
        notes: "checked",
      },
    });
    assert.equal(reviewResponse.statusCode, 200);
    const reviewed = reviewResponse.json() as ResearchJobRecord;
    assert.equal(reviewed.reviewStatus, "approved");
    assert.equal(reviewed.status, "completed");
    assert.equal(reviewed.reviewNotes, "checked");

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/research-jobs/${created.id}/cancel`,
    });
    assert.equal(cancelResponse.statusCode, 200);
    assert.deepEqual(cancelled, [created.id]);

    const artifactResponse = await app.inject({
      method: "GET",
      url: "/research-jobs/artifact-run/artifacts/report.md",
    });
    assert.equal(artifactResponse.statusCode, 200);
    assert.match(artifactResponse.body, /# Report/);

    const missingArtifactResponse = await app.inject({
      method: "GET",
      url: "/research-jobs/artifact-run/artifacts/missing.md",
    });
    assert.equal(missingArtifactResponse.statusCode, 404);

    await app.close();
  });
});
