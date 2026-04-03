import crypto from "node:crypto";

import type {
  ExecutionMode,
  FreshnessAssessment,
  FreshnessSensitivity,
  ResearchJobRecord,
  ResearchJobRequest,
  ReviewStatus,
  RunStatus,
} from "./types.js";

export function createRunId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createQueuedRunRecord(
  request: ResearchJobRequest,
  executionMode: ExecutionMode,
  freshnessSensitivity: FreshnessSensitivity,
  runId = createRunId(),
): ResearchJobRecord {
  const now = nowIso();

  return {
    id: runId,
    prompt: request.prompt,
    requestedBy: request.requestedBy,
    executionMode,
    status: "queued",
    reviewStatus: "not_requested",
    freshnessSensitivity,
    freshnessVerdict:
      freshnessSensitivity === "time_sensitive" ? "warning" : "not_applicable",
    freshnessReasons: [],
    artifactPointers: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function runningPatch(): Partial<ResearchJobRecord> {
  const now = nowIso();
  return {
    status: "running",
    startedAt: now,
    updatedAt: now,
  };
}

export function completionPatch(args: {
  assessment: FreshnessAssessment;
  artifactPointers: ResearchJobRecord["artifactPointers"];
  reportExcerpt: string;
}): Partial<ResearchJobRecord> {
  const now = nowIso();
  const reviewStatus: ReviewStatus =
    args.assessment.verdict === "failed" ? "pending" : "not_requested";
  const status: RunStatus =
    args.assessment.verdict === "failed" ? "awaiting_review" : "completed";

  return {
    status,
    reviewStatus,
    freshnessSensitivity: args.assessment.sensitivity,
    freshnessVerdict: args.assessment.verdict,
    freshnessReasons: args.assessment.reasons,
    artifactPointers: args.artifactPointers,
    reportExcerpt: args.reportExcerpt,
    completedAt: now,
    updatedAt: now,
  };
}

export function failurePatch(error: unknown): Partial<ResearchJobRecord> {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "failed",
    errorMessage: message,
    updatedAt: nowIso(),
    completedAt: nowIso(),
  };
}
