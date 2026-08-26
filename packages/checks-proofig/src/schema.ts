import { z } from 'zod';
import { FileMetadataSectionItemSchema } from '@curvenote/scms-core';

/**
 * Proofig webhook "ready notification" states.
 *
 * We validate against the enumerated table in the Proofig documentation (PDF page 16).
 */
export enum KnownState {
  Processing = 'Processing',
  AwaitingSubImageApproval = 'Awaiting: Sub-Image Approval',
  AwaitingReview = 'Awaiting: Review',
  ReportClean = 'Report: Clean',
  ReportFlagged = 'Report: Flagged',
  Deleted = 'Deleted',
}

/** Array of known states for membership checks (e.g. .includes()). */
export const KNOWN_STATES: readonly KnownState[] = Object.values(KnownState);

export const ProofigNotifyStateSchema = z.enum(KnownState);

/**
 * Zod schema for the Proofig notify webhook payload.
 *
 * NOTE: `submit_req_id` may be empty from Proofig's perspective, so we accept an empty string
 * and do not enforce equality with the URL `:id`.
 */
export const ProofigNotifyPayloadSchema = z.object({
  submit_req_id: z.string(),
  report_id: z.string(),
  state: ProofigNotifyStateSchema,
  subimages_total: z.number().int().nonnegative().optional(),
  matches_review: z.number().int().nonnegative().optional(),
  matches_report: z.number().int().nonnegative().optional(),
  inspects_report: z.number().int().nonnegative().optional(),
  report_url: z.string().optional(),
  number: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
});

export type ProofigNotifyPayload = z.infer<typeof ProofigNotifyPayloadSchema>;

export const ProofigNotifyEventSchema = z.object({
  receivedAt: z.string(),
  payload: ProofigNotifyPayloadSchema,
});

/**
 * Proofig workflow stage status.
 */
export const LinearStageStatusSchema = z.enum([
  'pending', // Not started yet
  'processing', // Currently in progress
  'completed', // Successfully completed (we saw the expected Proofig progression / notifies)
  'notify-skipped', // Advanced without the usual notifies (late payload catch-up)
  'error', // Error occurred
]);

/**
 * Non-linear (final/review) stage statuses.
 *
 * NOTE: This schema is intentionally richer than the linear stages to support iterative review.
 */
export const ReviewStageStatusSchema = z.enum([
  'pending', // Not started
  'requested', // In progress / awaiting manual action
  'completed', // Review completed (received at least one Report: notification)
  'not-requested', // No review was requested, transitioned stright to clean
  'error', // Error occurred
]);

export const ReportReviewOutcomeSchema = z.enum([
  'pending', // Not started / not requested yet
  'clean', // No issues found
  'flagged', // Issues found
]);

/**
 * Individual Proofig workflow stage schemas.
 */
export const LinearStageSchema = z.object({
  status: LinearStageStatusSchema,
  history: z.array(
    z.object({
      status: LinearStageStatusSchema,
      timestamp: z.string(),
    }),
  ),
  timestamp: z.string(),
  error: z.string().optional(), // Error message if failed
});

export const ReviewStageSchema = z.object({
  status: ReviewStageStatusSchema,
  outcome: ReportReviewOutcomeSchema.optional(),
  history: z.array(
    z.object({
      status: ReviewStageStatusSchema,
      outcome: ReportReviewOutcomeSchema,
      timestamp: z.string(),
    }),
  ),
  timestamp: z.string(),
  error: z.string().optional(), // Error message if failed
  events: z.array(ProofigNotifyEventSchema).optional(), // Notify payload history for this stage
});

export const ProofigSummarySchema = z.object({
  state: ProofigNotifyStateSchema,
  subimagesTotal: z.number().int().nonnegative().optional(),
  matchesReview: z.number().int().nonnegative().optional(),
  matchesReport: z.number().int().nonnegative().optional(),
  inspectsReport: z.number().int().nonnegative().optional(),
  reportUrl: z.string().optional(),
  number: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
  submitReqId: z.string().optional(),
  receivedAt: z.string(),
});

export const ProofigPreparationSchema = z.object({
  /** Platform CONVERTER_TASK job id when source is DOCX. */
  converterJobId: z.string().optional(),
  sourceFormat: z.enum(['docx', 'pdf']).optional(),
});

/**
 * Proofig-specific status tracking schema.
 * Tracks the Proofig workflow (optional document prep + Proofig stages) plus `summary`.
 */
export const proofigDataSchema = z.object({
  reportId: z.string().optional(), // Proofig report ID from initial POST / notifications
  reportUrl: z.string().optional(), // Latest Proofig UI URL from notifications
  deleted: z.boolean().optional(), // Set true if Proofig sends Deleted
  summary: ProofigSummarySchema.optional(),
  preparation: ProofigPreparationSchema.optional(),
  stages: z.object({
    /** DOCX-only: converting manuscript to PDF before Proofig upload. */
    documentPreparation: LinearStageSchema.optional(),
    initialPost: LinearStageSchema,
    subimageDetection: LinearStageSchema.optional(),
    subimageSelection: LinearStageSchema.optional(),
    integrityDetection: LinearStageSchema.optional(),
    resultsReview: ReviewStageSchema.optional(),
  }),
  /** Lineage when this run was created by retrying a failed run. */
  retryOfRunId: z.string().optional(),
  retriedAt: z.string().optional(),
  retriedByUserId: z.string().optional(),
  /** Set on a failed source run when a retry has been started. */
  supersededByRunId: z.string().optional(),
  supersededAt: z.string().optional(),
  supersededByUserId: z.string().optional(),
  /** Generated report files keyed by storage path (e.g. the Proofig report PDF). */
  files: z.record(z.string(), FileMetadataSectionItemSchema).optional(),
  /** True after the Proofig report PDF for `storedReportId` was written to storage. */
  proofigReportStored: z.boolean().optional(),
  /** Proofig report id that was persisted to `files` (used for idempotency). */
  storedReportId: z.string().optional(),
  /** Last PROOFIG_PERSIST_PDF failure message (cleared on enqueue / successful store). */
  proofigReportPdfError: z.string().optional(),
  /** ISO timestamp when `proofigReportPdfError` was last set. */
  proofigReportPdfFailedAt: z.string().optional(),
  /** Proofig report id targeted by the failed PDF generation attempt. */
  proofigReportPdfFailedReportId: z.string().optional(),
  /**
   * ISO timestamp when a PROOFIG_PERSIST_PDF job was last enqueued for this run.
   * Distinguishes “never requested” (legacy / idle) from in-flight generation for the UI.
   * Cleared when the PDF is stored or a persist failure is recorded.
   */
  proofigReportPdfRequestedAt: z.string().optional(),
});

export type ProofigStageStatus = z.infer<typeof LinearStageStatusSchema>;
export type ProofigStage = z.infer<typeof LinearStageSchema>;
export type ProofigReviewStage = z.infer<typeof ReviewStageSchema>;
export type ProofigReviewStageStatus = z.infer<typeof ReviewStageStatusSchema>;
export type ProofigOutcome = z.infer<typeof ReportReviewOutcomeSchema>;
export type ProofigDataSchema = z.infer<typeof proofigDataSchema>;
export type ProofigNotifyState = z.infer<typeof ProofigNotifyStateSchema>;

export type ProofigStages = ProofigDataSchema['stages'];

/** Linear stage is past for pipeline purposes (real completion or catch-up). */
export function linearStageIsDone(status: ProofigStageStatus | undefined): boolean {
  return status === 'completed' || status === 'notify-skipped';
}

export type RetrySupersessionInfo = {
  supersededByRunId: string;
  supersededAt: string;
};

/** Lineage stamped on a source run when a retry has been started. */
export function getRetrySupersessionInfo(
  data: ProofigDataSchema | undefined,
): RetrySupersessionInfo | null {
  const supersededByRunId = data?.supersededByRunId?.trim();
  const supersededAt = data?.supersededAt?.trim();
  if (!supersededByRunId || !supersededAt) return null;
  return { supersededByRunId, supersededAt };
}

/** True if any Proofig stage has errored. */
export function hasError(data: ProofigDataSchema | undefined): boolean {
  if (!data?.stages) return false;
  return Object.values(data.stages).some((stage) => stage?.status === 'error');
}

export const MINIMAL_PROOFIG_SERVICE_DATA: ProofigDataSchema = {
  stages: {
    initialPost: { status: 'pending', history: [], timestamp: new Date().toISOString() },
  },
};

// Default stages structure (used defensively in UI)
export const ALL_PENDING_STAGES: ProofigStages = {
  initialPost: { status: 'pending', history: [], timestamp: new Date().toISOString() },
  subimageDetection: { status: 'pending', history: [], timestamp: new Date().toISOString() },
  subimageSelection: { status: 'pending', history: [], timestamp: new Date().toISOString() },
  integrityDetection: { status: 'pending', history: [], timestamp: new Date().toISOString() },
  resultsReview: { status: 'pending', history: [], timestamp: new Date().toISOString() },
};

export const STAGE_ORDER: (keyof ProofigStages)[] = [
  'documentPreparation',
  'initialPost',
  'subimageDetection',
  'subimageSelection',
  'integrityDetection',
  'resultsReview',
];

const LINEAR_STAGE_KEYS = new Set<keyof ProofigStages>([
  'documentPreparation',
  'initialPost',
  'subimageDetection',
  'subimageSelection',
  'integrityDetection',
]);

/** DOCX uploads count document preparation in the progress bar; PDF skips it (prep is instant). */
export function countsDocumentPreparationInProgress(
  stages: ProofigStages,
  preparation?: ProofigDataSchema['preparation'],
): boolean {
  return preparation?.sourceFormat === 'docx' && stages.documentPreparation != null;
}

/** Ordered progress-bar stages (excludes results review). */
export function getProofigProgressStageOrder(
  stages: ProofigStages,
  preparation?: ProofigDataSchema['preparation'],
): (keyof ProofigStages)[] {
  const base: (keyof ProofigStages)[] = [
    'initialPost',
    'subimageDetection',
    'subimageSelection',
    'integrityDetection',
  ];
  if (countsDocumentPreparationInProgress(stages, preparation)) {
    return ['documentPreparation', ...base];
  }
  return base;
}

export function getStageProgressStep(
  stageKey: keyof ProofigStages,
  stages: ProofigStages,
  preparation?: ProofigDataSchema['preparation'],
): { step: number; numSteps: number } {
  const order = getProofigProgressStageOrder(stages, preparation);
  const idx = order.indexOf(stageKey);
  return { step: idx >= 0 ? idx + 1 : 1, numSteps: order.length };
}

export function getCurrentProofigStage(stages: ProofigStages) {
  // Find the current active stage
  let currentStageIndex = 0;
  let currentStage: keyof ProofigStages = 'initialPost';
  let currentStageData: ProofigStages[keyof ProofigStages] = stages['initialPost'];

  const stageOrder = STAGE_ORDER.filter(
    (key) => key !== 'documentPreparation' || stages.documentPreparation != null,
  );

  for (let i = 0; i < stageOrder.length; i++) {
    const stage = stageOrder[i];
    const stageData = stages[stage];
    const stageStatus = stageData?.status ?? 'pending';

    const isLinearStage = LINEAR_STAGE_KEYS.has(stage);

    if (isLinearStage) {
      if (stageStatus === 'processing' || stageStatus === 'pending' || stageStatus === 'error') {
        currentStageIndex = i;
        currentStage = stage;
        currentStageData = stageData;
        break;
      }
    } else {
      // Review/final stages: in-flight human review (`requested`) or pending/error are "active"
      if (stageStatus === 'pending' || stageStatus === 'error' || stageStatus === 'requested') {
        currentStageIndex = i;
        currentStage = stage;
        currentStageData = stageData;
        break;
      }
    }

    // If we get here, this stage is "finished" (completed/skipped/clean/flagged/etc).
    // If this was the last stage, keep it as the current stage.
    if (i === stageOrder.length - 1) {
      currentStageIndex = i;
      currentStage = stage;
      currentStageData = stageData;
    }
  }

  return { currentStageIndex, currentStage, currentStageData };
}

/**
 * True when the UI shows “awaiting sub-image approval” (timeline/details subimageSelection step,
 * excluding error and notify-skipped). Used for one-time status hydration on work details load.
 */
export function isProofigAwaitingSubimageApprovalInUi(stages: ProofigStages): boolean {
  const merged = { ...ALL_PENDING_STAGES, ...stages };
  const { currentStage } = getCurrentProofigStage(merged);
  if (currentStage !== 'subimageSelection') return false;
  const sel = merged.subimageSelection;
  if (!sel) return false;
  return sel.status !== 'error' && sel.status !== 'notify-skipped';
}

/** True while DOCX→PDF conversion is in flight and should be hydrated from the converter job. */
export function isProofigAwaitingDocumentPreparationInUi(stages: ProofigStages): boolean {
  const prep = stages.documentPreparation;
  if (!prep) return false;
  return prep.status === 'processing' || prep.status === 'pending';
}

/** True when upload UI should note that Word conversion already finished. */
export function shouldShowDocxPreparationCompleteNote(
  preparation: ProofigDataSchema['preparation'],
  stages: ProofigStages,
): boolean {
  return (
    preparation?.sourceFormat === 'docx' && linearStageIsDone(stages.documentPreparation?.status)
  );
}
