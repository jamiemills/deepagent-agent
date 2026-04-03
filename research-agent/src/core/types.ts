import type { z } from "zod";

import type {
  artifactPointersSchema,
  claimLedgerRecordSchema,
  executionModeSchema,
  fetchObservationSchema,
  freshnessAssessmentSchema,
  freshnessSensitivitySchema,
  freshnessVerdictSchema,
  provenanceManifestSchema,
  researchJobRecordSchema,
  researchJobRequestSchema,
  reviewStatusSchema,
  runStatusSchema,
  searchObservationSchema,
  sourceOriginSchema,
  sourceRecordSchema,
  sourceTypeSchema,
} from "./schemas.js";

export type ExecutionMode = z.infer<typeof executionModeSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type FreshnessSensitivity = z.infer<typeof freshnessSensitivitySchema>;
export type FreshnessVerdict = z.infer<typeof freshnessVerdictSchema>;
export type SourceOrigin = z.infer<typeof sourceOriginSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;
export type ResearchJobRequest = z.infer<typeof researchJobRequestSchema>;
export type ClaimLedgerRecord = z.infer<typeof claimLedgerRecordSchema>;
export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export type FreshnessAssessment = z.infer<typeof freshnessAssessmentSchema>;
export type ProvenanceManifest = z.infer<typeof provenanceManifestSchema>;
export type ArtifactPointers = z.infer<typeof artifactPointersSchema>;
export type ResearchJobRecord = z.infer<typeof researchJobRecordSchema>;
export type SearchObservation = z.infer<typeof searchObservationSchema>;
export type FetchObservation = z.infer<typeof fetchObservationSchema>;
