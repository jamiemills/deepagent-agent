import { Effect } from "effect";

import {
  researchJobRecordSchema,
  researchJobRequestSchema,
  reviewRequestSchema,
} from "./core/schemas.js";
import type { ResearchJobRecord, ResearchJobRequest } from "./core/types.js";

export class ResearchApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async createJob(request: ResearchJobRequest): Promise<ResearchJobRecord> {
    const payload = researchJobRequestSchema.parse(request);
    return Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(`${this.baseUrl}/research-jobs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            throw new Error(
              `Failed to create job: ${response.status} ${await response.text()}`,
            );
          }
          return researchJobRecordSchema.parse(await response.json());
        },
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      }),
    );
  }

  async getJob(runId: string): Promise<ResearchJobRecord> {
    return Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(
            `${this.baseUrl}/research-jobs/${runId}`,
          );
          if (!response.ok) {
            throw new Error(
              `Failed to load job ${runId}: ${response.status} ${await response.text()}`,
            );
          }
          return researchJobRecordSchema.parse(await response.json());
        },
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      }),
    );
  }

  async cancelJob(runId: string): Promise<ResearchJobRecord> {
    return Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(
            `${this.baseUrl}/research-jobs/${runId}/cancel`,
            {
              method: "POST",
            },
          );
          if (!response.ok) {
            throw new Error(
              `Failed to cancel job ${runId}: ${response.status} ${await response.text()}`,
            );
          }
          return researchJobRecordSchema.parse(await response.json());
        },
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      }),
    );
  }

  async reviewJob(
    runId: string,
    decision: "approved" | "rejected" | "pending",
    notes?: string,
  ): Promise<ResearchJobRecord> {
    const payload = reviewRequestSchema.parse({ decision, notes });
    return Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(
            `${this.baseUrl}/research-jobs/${runId}/review`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          if (!response.ok) {
            throw new Error(
              `Failed to review job ${runId}: ${response.status} ${await response.text()}`,
            );
          }
          return researchJobRecordSchema.parse(await response.json());
        },
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      }),
    );
  }

  async getArtifact(runId: string, artifactName: string): Promise<string> {
    return Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(
            `${this.baseUrl}/research-jobs/${runId}/artifacts/${artifactName}`,
          );
          if (!response.ok) {
            throw new Error(
              `Failed to fetch artifact ${artifactName} for ${runId}: ${response.status} ${await response.text()}`,
            );
          }
          return response.text();
        },
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      }),
    );
  }
}
