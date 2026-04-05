import z from "zod/v3";

export const executionModeSchema = z.enum(["local", "hosted"]);
export const runStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_review",
  "completed",
  "failed",
  "cancelled",
]);
export const reviewStatusSchema = z.enum([
  "not_requested",
  "pending",
  "approved",
  "rejected",
]);
export const freshnessSensitivitySchema = z.enum([
  "evergreen",
  "time_sensitive",
]);
export const freshnessVerdictSchema = z.enum([
  "not_applicable",
  "passed",
  "warning",
  "failed",
]);
export const sourceOriginSchema = z.enum(["search_result", "fetched_page"]);
export const sourceTypeSchema = z.enum([
  "official",
  "news",
  "reference",
  "other",
]);

export const researchJobRequestSchema = z.object({
  prompt: z.string().min(1),
  requestedBy: z.string().optional(),
});

export const reviewRequestSchema = z.object({
  decision: z.enum(["approved", "rejected", "pending"]),
  notes: z.string().optional(),
});

export const hostedResearchJobInputSchema = z.object({
  runId: z.string(),
  request: researchJobRequestSchema,
});

export const claimLedgerRecordSchema = z.object({
  claim: z.string(),
  sourceUrls: z.array(z.string().url()),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  notes: z.string().optional(),
});

export const sourceRecordSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  domain: z.string(),
  sourceOrigin: sourceOriginSchema,
  sourceType: sourceTypeSchema,
  description: z.string().optional(),
  language: z.string().nullable().optional(),
  discoveredAt: z.string(),
  fetchedAt: z.string().optional(),
  ageText: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  lastModifiedAt: z.string().nullable().optional(),
  isPrimaryCandidate: z.boolean(),
});

export const freshnessAssessmentSchema = z.object({
  sensitivity: freshnessSensitivitySchema,
  verdict: freshnessVerdictSchema,
  reasons: z.array(z.string()),
  recentSourceCount: z.number().int().nonnegative(),
  datedSourceCount: z.number().int().nonnegative(),
});

export const provenanceManifestSchema = z.object({
  runId: z.string(),
  generatedAt: z.string(),
  prompt: z.string(),
  freshness: freshnessAssessmentSchema,
  sourceCount: z.number().int().nonnegative(),
  sources: z.array(sourceRecordSchema),
  claimLedger: z.array(claimLedgerRecordSchema),
});

export const artifactPointersSchema = z.object({
  report: z.string().optional(),
  provenance: z.string().optional(),
  summary: z.string().optional(),
  notes: z.array(z.string()).optional(),
  out: z.array(z.string()).optional(),
});

export const researchJobRecordSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  requestedBy: z.string().optional(),
  executionMode: executionModeSchema,
  status: runStatusSchema,
  reviewStatus: reviewStatusSchema,
  freshnessSensitivity: freshnessSensitivitySchema,
  freshnessVerdict: freshnessVerdictSchema,
  freshnessReasons: z.array(z.string()),
  artifactPointers: artifactPointersSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  errorMessage: z.string().optional(),
  reviewNotes: z.string().optional(),
  reportExcerpt: z.string().optional(),
});

export const searchObservationSchema = z.object({
  query: z.string(),
  observedAt: z.string(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      description: z.string().optional(),
      language: z.string().nullable().optional(),
      age: z.string().nullable().optional(),
    }),
  ),
});

export const fetchObservationSchema = z.object({
  url: z.string().url(),
  observedAt: z.string(),
  contentType: z.string().nullable().optional(),
  title: z.string().optional(),
  lastModified: z.string().nullable().optional(),
});
