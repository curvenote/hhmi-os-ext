import { z } from 'zod';
import { FileMetadataSectionItemSchema } from '@curvenote/scms-core';
import {
  WebhookEventSchema,
  type SimilarityReport as SimilarityReportPayload,
} from './webhookSchemas.js';

// ---------------------------------------------------------------------------
// Linear stage tracking (mirroring proofig pattern)
// ---------------------------------------------------------------------------

export const LinearStageStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'notify-skipped',
  'error',
]);

export type LinearStageStatus = z.infer<typeof LinearStageStatusSchema>;

export const LinearStageSchema = z.object({
  status: LinearStageStatusSchema,
  history: z.array(
    z.object({
      status: LinearStageStatusSchema,
      timestamp: z.string(),
    }),
  ),
  timestamp: z.string(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
});

export type LinearStage = z.infer<typeof LinearStageSchema>;

/** Linear stage is past for pipeline purposes (real completion or catch-up). */
export function linearStageIsDone(status: LinearStageStatus | undefined): boolean {
  return status === 'completed' || status === 'notify-skipped';
}

// ---------------------------------------------------------------------------
// Stages object
// ---------------------------------------------------------------------------

export const TextIntegrityStagesSchema = z.object({
  submission: LinearStageSchema,
  processing: LinearStageSchema.optional(),
  reportGeneration: LinearStageSchema.optional(),
});

export type TextIntegrityStages = z.infer<typeof TextIntegrityStagesSchema>;

export const STAGE_ORDER: (keyof TextIntegrityStages)[] = [
  'submission',
  'processing',
  'reportGeneration',
];

// ---------------------------------------------------------------------------
// Stored similarity report (camelCase — converted from webhook payload)
// ---------------------------------------------------------------------------

export const StoredTopMatchSchema = z.object({
  percentage: z.number(),
  submissionId: z.string().optional(),
  sourceType: z.string(),
  matchedWordCountTotal: z.number(),
  submittedDate: z.string().optional(),
  institutionName: z.string().optional(),
  name: z.string(),
});
export type StoredTopMatch = z.infer<typeof StoredTopMatchSchema>;

export const StoredSimilarityReportSchema = z.object({
  submissionId: z.string(),
  overallMatchPercentage: z.number(),
  internetMatchPercentage: z.number().nullable().optional(),
  publicationMatchPercentage: z.number().nullable().optional(),
  submittedWorksMatchPercentage: z.number().nullable().optional(),
  status: z.enum(['PROCESSING', 'COMPLETE']),
  timeRequested: z.string(),
  timeGenerated: z.string().optional(),
  topSourceLargestMatchedWordCount: z.number().optional(),
  topMatches: z.array(StoredTopMatchSchema).max(5).optional(),
});
export type StoredSimilarityReport = z.infer<typeof StoredSimilarityReportSchema>;

/**
 * Transform a snake_case provider webhook payload into the camelCase stored shape.
 */
export function toStoredSimilarityReport(payload: SimilarityReportPayload): StoredSimilarityReport {
  return {
    submissionId: payload.submission_id,
    overallMatchPercentage: payload.overall_match_percentage,
    internetMatchPercentage: payload.internet_match_percentage,
    publicationMatchPercentage: payload.publication_match_percentage,
    submittedWorksMatchPercentage: payload.submitted_works_match_percentage,
    status: payload.status,
    timeRequested: payload.time_requested,
    timeGenerated: payload.time_generated,
    topSourceLargestMatchedWordCount: payload.top_source_largest_matched_word_count,
    topMatches: payload.top_matches?.map((m) => ({
      percentage: m.percentage,
      submissionId: m.submission_id,
      sourceType: m.source_type,
      matchedWordCountTotal: m.matched_word_count_total,
      submittedDate: m.submitted_date,
      institutionName: m.institution_name,
      name: m.name,
    })),
  };
}

// ---------------------------------------------------------------------------
// Summary (denormalized latest-webhook snapshot)
// ---------------------------------------------------------------------------

export const TextIntegrityLatestSchema = z.object({
  event: WebhookEventSchema,
  receivedAt: z.string(),
  overallMatchPercentage: z.number().optional(),
  reportPdfId: z.string().optional(),
  reportPdfUrl: z.string().optional(),
  errorMessage: z.string().optional(),
  errorCode: z.string().optional(),
});
export type TextIntegrityLatest = z.infer<typeof TextIntegrityLatestSchema>;

export const RelayRecoveryLeaseSchema = z.object({
  phase: z.string(),
  action: z.string(),
  reason: z.string().optional(),
  requestedAt: z.string(),
  leaseOwner: z.string(),
  leaseExpiresAt: z.string(),
  requestedByUserId: z.string().optional(),
  startedAt: z.string().optional(),
  localProcessingStartedAt: z.string().optional(),
});
export type RelayRecoveryLease = z.infer<typeof RelayRecoveryLeaseSchema>;

// ---------------------------------------------------------------------------
// Webhook event log entry
// ---------------------------------------------------------------------------

export const WebhookEventLogEntrySchema = z.object({
  event: WebhookEventSchema,
  receivedAt: z.string(),
  payload: z.any().optional(),
});

// ---------------------------------------------------------------------------
// Service manifest snapshot (stamped from merged extension config on execute)
// ---------------------------------------------------------------------------

export const ServiceManifestSnapshotSchema = z.object({
  name: z.string(),
  title: z.string(),
  logo: z.string(),
  version: z.string(),
});

export type ServiceManifestSnapshot = z.infer<typeof ServiceManifestSnapshotSchema>;

/** Parse a service manifest snapshot from unknown JSON. */
export function parseServiceManifestSnapshot(raw: unknown): ServiceManifestSnapshot | undefined {
  const parsed = ServiceManifestSnapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Read the configured plugin manifest from check run `serviceData`
 * (same object passed as `metadata` in UI).
 */
export function getTextIntegrityManifest(metadata: unknown): ServiceManifestSnapshot | undefined {
  if (metadata == null || typeof metadata !== 'object') return undefined;
  return parseServiceManifestSnapshot((metadata as Record<string, unknown>).manifest);
}

// ---------------------------------------------------------------------------
// Main service data schema
// ---------------------------------------------------------------------------

/**
 * Schema for Text Integrity check service run serviceData.
 *
 * `stages` is the source of truth for workflow progression.
 */
export const textIntegrityDataSchema = z.object({
  stages: TextIntegrityStagesSchema,

  /** Service manifest snapshot from merged extension config, stamped at execute time. */
  manifest: ServiceManifestSnapshotSchema.optional(),

  /** Denormalized snapshot of the most recent webhook event. */
  latest: TextIntegrityLatestSchema.optional(),

  /** Full webhook event history (capped). */
  webhookHistory: z.array(WebhookEventLogEntrySchema).optional(),

  // --- Top-level identifiers ---
  /** Provider check id from relay upload (`result.externalId`); preferred for /check/:externalId routes. */
  externalId: z.string().optional(),
  /**
   * Legacy: same as externalId for rows created before relay instance API.
   * Also populated on new submits for backward compatibility.
   */
  submissionId: z.string().optional(),
  /** External reference from the service plugin (provider submission id). */
  externalRef: z.string().optional(),
  /** PDF id from the provider similarity-report flow, used to download via relay. */
  reportPdfId: z.string().optional(),
  /**
   * Similarity report PDF URL (from checks-relay notify `payload.report.report_pdf_url`).
   * Caller must use provider auth to fetch; not a public browser link unless proxied.
   */
  reportPdfUrl: z.string().optional(),

  /**
   * Persisted similarity PDF on work version storage (slot `generated`).
   * Keys are storage paths; values match work-version file metadata shape.
   */
  files: z.record(z.string(), FileMetadataSectionItemSchema).optional(),
  /** True after the similarity PDF for `storedReportPdfId` was written to storage. */
  similarityReportStored: z.boolean().optional(),
  /** Provider PDF id that was persisted to `files` (used for idempotency on restart). */
  storedReportPdfId: z.string().optional(),
  /** True when Viewer changes invalidated the archived similarity PDF. */
  similarityReportPdfInvalidated: z.boolean().optional(),
  /** Timestamp when the archived similarity PDF was invalidated. */
  similarityReportPdfInvalidatedAt: z.string().optional(),
  /** Provider event that invalidated the archived similarity PDF. */
  similarityReportPdfInvalidatedByEvent: z.string().optional(),

  // --- Report data ---
  /** Summary report when processing is complete (camelCase stored shape). */
  summaryReport: StoredSimilarityReportSchema.optional(),
  /** URL to open the report in the provider viewer (if available). */
  viewerUrl: z.string().optional(),

  /** Provider-neutral recovery lease for relay-hinted self-heal actions. */
  relayRecovery: RelayRecoveryLeaseSchema.optional(),

  /** Lineage when this run was created by retrying a failed run. */
  retryOfRunId: z.string().optional(),
  retriedAt: z.string().optional(),
  retriedByUserId: z.string().optional(),
  /** Set on a failed source run when a retry has been started. */
  supersededByRunId: z.string().optional(),
  supersededAt: z.string().optional(),
  supersededByUserId: z.string().optional(),
});

export type TextIntegrityDataSchema = z.infer<typeof textIntegrityDataSchema>;

// ---------------------------------------------------------------------------
// Defaults and helpers
// ---------------------------------------------------------------------------

export const MINIMAL_TEXT_INTEGRITY_SERVICE_DATA: TextIntegrityDataSchema = {
  stages: {
    submission: { status: 'pending', history: [], timestamp: new Date().toISOString() },
  },
};

export const ALL_PENDING_STAGES: TextIntegrityStages = {
  submission: { status: 'pending', history: [], timestamp: new Date().toISOString() },
  processing: { status: 'pending', history: [], timestamp: new Date().toISOString() },
  reportGeneration: { status: 'pending', history: [], timestamp: new Date().toISOString() },
};

// ---------------------------------------------------------------------------
// UI query helpers — components should use these instead of a flat enum state
// ---------------------------------------------------------------------------

/** True when submission or processing failed (run-level / auto-retry semantics). */
export function hasPipelineError(data: TextIntegrityDataSchema | undefined): boolean {
  if (!data?.stages) return false;
  return data.stages.submission.status === 'error' || data.stages.processing?.status === 'error';
}

/** True if any stage has errored (includes report PDF generation for UI). */
export type RetrySupersessionInfo = {
  supersededByRunId: string;
  supersededAt: string;
};

/** Lineage stamped on a source run when a retry has been started. */
export function getRetrySupersessionInfo(
  data: TextIntegrityDataSchema | undefined,
): RetrySupersessionInfo | null {
  const supersededByRunId = data?.supersededByRunId?.trim();
  const supersededAt = data?.supersededAt?.trim();
  if (!supersededByRunId || !supersededAt) return null;
  return { supersededByRunId, supersededAt };
}

/** True if any stage has errored. */
export function hasError(data: TextIntegrityDataSchema | undefined): boolean {
  if (!data?.stages) return false;
  return hasPipelineError(data) || data.stages.reportGeneration?.status === 'error';
}

/** First error message found across stages. */
export function getErrorMessage(data: TextIntegrityDataSchema | undefined): string | undefined {
  if (!data?.stages) return undefined;
  if (data.stages.submission.status === 'error') return data.stages.submission.error;
  if (data.stages.processing?.status === 'error') return data.stages.processing.error;
  if (data.stages.reportGeneration?.status === 'error') return data.stages.reportGeneration.error;
  return undefined;
}

/** 1-based pipeline segment index where `status === 'error'` (submission → processing → report). */
export function getFailedPipelineStep(data: TextIntegrityDataSchema | undefined): 1 | 2 | 3 | null {
  if (!data?.stages) return null;
  if (data.stages.submission.status === 'error') return 1;
  if (data.stages.processing?.status === 'error') return 2;
  if (data.stages.reportGeneration?.status === 'error') return 3;
  return null;
}

/** Display title for the segment that failed (alert copy). */
export function getFailedStageDisplayTitle(step: 1 | 2 | 3): string {
  switch (step) {
    case 1:
      return 'Submission';
    case 2:
      return 'Processing';
    case 3:
      return 'Report generation';
  }
}

export type ErrorPipelineSegmentTone = 'complete' | 'error' | 'muted';

/**
 * Segment fills for the error summary bar: stages before the failure are complete (green),
 * the failed segment is red, later segments muted.
 */
export function getErrorPipelineSegmentTones(
  data: TextIntegrityDataSchema | undefined,
  numSteps = 3,
): ErrorPipelineSegmentTone[] {
  const failed = getFailedPipelineStep(data);
  if (failed == null) {
    return Array.from({ length: numSteps }, () => 'muted' as const);
  }
  return Array.from({ length: numSteps }, (_, i) => {
    const step = i + 1;
    if (step < failed) return 'complete';
    if (step === failed) return 'error';
    return 'muted';
  });
}

/** True when the processing stage is done and a summary report is available. */
export function canShowResults(data: TextIntegrityDataSchema | undefined): boolean {
  if (!data?.stages) return false;
  return linearStageIsDone(data.stages.processing?.status);
}

/** True when the report generation stage is done and a PDF URL is available. */
export function canShowReportPdf(data: TextIntegrityDataSchema | undefined): boolean {
  if (!data?.stages) return false;
  return linearStageIsDone(data.stages.reportGeneration?.status);
}

/** True while the similarity PDF report is still being generated (results UI waiting state). */
export function isWaitingForPdfReport(data: TextIntegrityDataSchema | undefined): boolean {
  const status = data?.stages?.reportGeneration?.status;
  return status === 'processing' || status === 'pending';
}

/** True while results can be shown but the current provider PDF is not stored yet. */
export function isWaitingForStoredPdfReport(data: TextIntegrityDataSchema | undefined): boolean {
  if (!data?.stages) return false;
  if (!canShowResults(data)) return false;
  if (isWaitingForPdfReport(data)) return true;
  if (data.similarityReportPdfInvalidated === true) return false;
  if (data.stages.reportGeneration?.status !== 'completed') return false;

  const currentReportPdfId = data.reportPdfId ?? data.latest?.reportPdfId;
  return data.similarityReportStored !== true || data.storedReportPdfId !== currentReportPdfId;
}

/** True after dispatch while the check run row exists but `serviceData.stages` is not stamped yet. */
export function isAwaitingInitialTextIntegrityStages(
  metadata: TextIntegrityDataSchema | undefined,
  checkRunId: string | undefined,
): boolean {
  return !metadata?.stages && Boolean(checkRunId?.trim());
}

/** Whether the checks section should poll remote status (loader revalidation). */
export function shouldPollTextIntegrityChecks(
  metadata: TextIntegrityDataSchema | undefined,
  checkRunId: string | undefined,
): boolean {
  const hasData = !!metadata?.stages;
  const showResults = canShowResults(metadata);
  const awaitingInitialStages = isAwaitingInitialTextIntegrityStages(metadata, checkRunId);
  const waitingForPdfReport = isWaitingForStoredPdfReport(metadata);
  return awaitingInitialStages || (hasData && !showResults) || waitingForPdfReport;
}

/** True when the similarity PDF has been persisted to work storage for this run. */
export function hasStoredSimilarityReport(data: TextIntegrityDataSchema | undefined): boolean {
  return data?.similarityReportStored === true;
}

/** @deprecated Use hasError/canShowResults/canShowReportPdf instead. Kept for test compatibility. */
export type TextIntegrityUIState =
  | 'no_run'
  | 'error'
  | 'submitting'
  | 'submission_complete'
  | 'processing_requested'
  | 'processing_complete'
  | 'report_generation_started'
  | 'report_generation_complete';

/** @deprecated Use hasError/canShowResults/canShowReportPdf instead. Kept for test compatibility. */
export function getCurrentTextIntegrityState(
  data: TextIntegrityDataSchema | undefined,
): TextIntegrityUIState {
  if (!data?.stages) return 'no_run';

  const { submission, processing, reportGeneration } = data.stages;

  if (submission.status === 'error') return 'error';
  if (processing?.status === 'error') return 'error';
  if (reportGeneration?.status === 'error') return 'error';

  if (linearStageIsDone(reportGeneration?.status)) return 'report_generation_complete';
  if (reportGeneration?.status === 'processing') return 'report_generation_started';
  if (linearStageIsDone(processing?.status)) return 'processing_complete';
  if (processing?.status === 'processing') return 'processing_requested';
  if (linearStageIsDone(submission.status)) return 'submission_complete';
  if (submission.status === 'processing' || submission.status === 'pending') return 'submitting';

  return 'no_run';
}

/** @deprecated Use getErrorMessage instead. */
export function getTextIntegrityError(
  data: TextIntegrityDataSchema | undefined,
): string | undefined {
  return getErrorMessage(data);
}

/**
 * Derive the current active stage info from the stages object (like proofig's getCurrentProofigStage).
 */
export function getCurrentTextIntegrityStage(stages: TextIntegrityStages) {
  let currentStageIndex = 0;
  let currentStage: keyof TextIntegrityStages = 'submission';
  let currentStageData: TextIntegrityStages[keyof TextIntegrityStages] = stages.submission;

  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const stage = STAGE_ORDER[i];
    const stageData = stages[stage];
    const stageStatus = stageData?.status ?? 'pending';

    if (stageStatus === 'processing' || stageStatus === 'pending' || stageStatus === 'error') {
      currentStageIndex = i;
      currentStage = stage;
      currentStageData = stageData;
      break;
    }

    if (i === STAGE_ORDER.length - 1) {
      currentStageIndex = i;
      currentStage = stage;
      currentStageData = stageData;
    }
  }

  return { currentStageIndex, currentStage, currentStageData };
}
