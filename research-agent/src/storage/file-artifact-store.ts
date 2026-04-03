import fs from "node:fs/promises";
import path from "node:path";

import type { ArtifactStore } from "./interfaces.js";

function sanitizeArtifactName(artifactName: string): string {
  const normalized = path.posix
    .normalize(artifactName)
    .replace(/^(\.\.(\/|\\|$))+/, "");
  return normalized.replace(/^\/+/, "");
}

export class FileArtifactStore implements ArtifactStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private artifactPath(runId: string, artifactName: string): string {
    return path.join(this.rootDir, runId, sanitizeArtifactName(artifactName));
  }

  private async ensureArtifactDir(
    runId: string,
    artifactName: string,
  ): Promise<string> {
    const target = this.artifactPath(runId, artifactName);
    await fs.mkdir(path.dirname(target), { recursive: true });
    return target;
  }

  async writeText(
    runId: string,
    artifactName: string,
    content: string,
  ): Promise<string> {
    const target = await this.ensureArtifactDir(runId, artifactName);
    await fs.writeFile(target, content, "utf8");
    return sanitizeArtifactName(artifactName);
  }

  async writeJson(
    runId: string,
    artifactName: string,
    content: unknown,
  ): Promise<string> {
    return this.writeText(
      runId,
      artifactName,
      JSON.stringify(content, null, 2),
    );
  }

  async copyFromFile(
    runId: string,
    artifactName: string,
    sourcePath: string,
  ): Promise<string> {
    const target = await this.ensureArtifactDir(runId, artifactName);
    await fs.copyFile(sourcePath, target);
    return sanitizeArtifactName(artifactName);
  }

  async readArtifact(runId: string, artifactName: string): Promise<Buffer> {
    return fs.readFile(this.artifactPath(runId, artifactName));
  }

  async listArtifacts(runId: string): Promise<string[]> {
    const runDir = path.join(this.rootDir, runId);

    async function walk(currentDir: string, prefix = ""): Promise<string[]> {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        const files: string[] = [];
        for (const entry of entries) {
          const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
          const absolute = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            files.push(...(await walk(absolute, relative)));
          } else {
            files.push(relative);
          }
        }
        return files.sort();
      } catch {
        return [];
      }
    }

    return walk(runDir);
  }
}
