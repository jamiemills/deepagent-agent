import path from "node:path";

import { loadConfig } from "../config.js";
import { executeResearchRun } from "../core/research-runner.js";
import type { ResearchJobRecord, ResearchJobRequest } from "../core/types.js";
import { FileArtifactStore } from "../storage/file-artifact-store.js";
import { FileMetadataStore } from "../storage/file-metadata-store.js";

export function createActivities(deps?: {
  config?: ReturnType<typeof loadConfig>;
  metadataStore?: FileMetadataStore;
  artifactStore?: FileArtifactStore;
  executeRun?: typeof executeResearchRun;
}) {
  const config = deps?.config ?? loadConfig();
  const metadataStore =
    deps?.metadataStore ??
    new FileMetadataStore(path.join(config.dataDir, "metadata"));
  const artifactStore =
    deps?.artifactStore ??
    new FileArtifactStore(path.join(config.dataDir, "artifacts"));
  const executeRun = deps?.executeRun ?? executeResearchRun;

  return {
    async runHostedResearchJob(input: {
      runId: string;
      request: ResearchJobRequest;
    }): Promise<ResearchJobRecord> {
      return executeRun({
        runId: input.runId,
        request: input.request,
        executionMode: "hosted",
        metadataStore,
        artifactStore,
        rethrowOnFailure: true,
      });
    },
  };
}
