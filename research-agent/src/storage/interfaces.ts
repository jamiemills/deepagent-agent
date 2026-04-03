import type { ResearchJobRecord } from "../core/types.js";

export interface MetadataStore {
  createRun(record: ResearchJobRecord): Promise<void>;
  getRun(runId: string): Promise<ResearchJobRecord | null>;
  updateRun(
    runId: string,
    patch: Partial<ResearchJobRecord>,
  ): Promise<ResearchJobRecord>;
}

export interface ArtifactStore {
  writeText(
    runId: string,
    artifactName: string,
    content: string,
  ): Promise<string>;
  writeJson(
    runId: string,
    artifactName: string,
    content: unknown,
  ): Promise<string>;
  copyFromFile(
    runId: string,
    artifactName: string,
    sourcePath: string,
  ): Promise<string>;
  readArtifact(runId: string, artifactName: string): Promise<Buffer>;
  listArtifacts(runId: string): Promise<string[]>;
}
