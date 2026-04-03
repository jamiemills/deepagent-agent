import fs from "node:fs/promises";
import path from "node:path";

import { researchJobRecordSchema } from "../core/schemas.js";
import type { ResearchJobRecord } from "../core/types.js";
import type { MetadataStore } from "./interfaces.js";

export class FileMetadataStore implements MetadataStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private runPath(runId: string): string {
    return path.join(this.rootDir, `${runId}.json`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  async createRun(record: ResearchJobRecord): Promise<void> {
    await this.ensureDir();
    const validated = researchJobRecordSchema.parse(record);
    await fs.writeFile(
      this.runPath(validated.id),
      JSON.stringify(validated, null, 2),
    );
  }

  async getRun(runId: string): Promise<ResearchJobRecord | null> {
    try {
      const raw = await fs.readFile(this.runPath(runId), "utf8");
      return researchJobRecordSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async updateRun(
    runId: string,
    patch: Partial<ResearchJobRecord>,
  ): Promise<ResearchJobRecord> {
    const existing = await this.getRun(runId);
    if (!existing) {
      throw new Error(`Run ${runId} not found.`);
    }

    const filteredPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Partial<ResearchJobRecord>;

    const next = {
      ...existing,
      ...filteredPatch,
      artifactPointers: {
        ...existing.artifactPointers,
        ...(filteredPatch.artifactPointers ?? {}),
      },
    };

    const validated = researchJobRecordSchema.parse(next);

    await this.ensureDir();
    await fs.writeFile(this.runPath(runId), JSON.stringify(validated, null, 2));
    return validated;
  }
}
