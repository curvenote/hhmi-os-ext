import type {
  ProofigStages,
  ProofigDataSchema,
  ProofigNotifyPayload,
  ProofigStageStatus,
  ProofigOutcome,
  ProofigReviewStageStatus,
} from '../schema.js';

import {
  KNOWN_STATES,
  KnownState,
  linearStageIsDone,
  MINIMAL_PROOFIG_SERVICE_DATA,
  ALL_PENDING_STAGES,
} from '../schema.js';

const HISTORY_LIMIT = 20;

function setLinearStage(
  stages: ProofigStages,
  key:
    | 'documentPreparation'
    | 'initialPost'
    | 'subimageDetection'
    | 'subimageSelection'
    | 'integrityDetection',
  status: ProofigStageStatus,
  receivedAt: string,
  error?: string,
) {
  const prev = stages[key];
  const prevStatus = prev?.status;
  const prevTimestamp = prev?.timestamp;
  const historyEntry =
    prevStatus != null && prevTimestamp != null
      ? { status: prevStatus, timestamp: prevTimestamp }
      : null;
  const history = [...(historyEntry ? [historyEntry] : []), ...(stages[key]?.history ?? [])].slice(
    0,
    HISTORY_LIMIT,
  );

  return {
    ...stages,
    [key]: {
      ...(stages[key] as any),
      status,
      timestamp: receivedAt,
      history,
      ...(error ? { error } : {}),
    },
  } as ProofigStages;
}

function setReviewStage(
  stages: ProofigStages,
  key: 'resultsReview',
  status: ProofigReviewStageStatus,
  outcome: ProofigOutcome,
  receivedAt: string,
) {
  const prev = stages[key] as
    | {
        status?: ProofigReviewStageStatus;
        outcome?: ProofigOutcome;
        timestamp?: string;
        history?: unknown[];
      }
    | undefined;
  const prevStatus = prev?.status;
  const prevOutcome = prev?.outcome ?? 'pending';
  const prevTimestamp = prev?.timestamp;
  const historyEntry =
    prevStatus != null && prevTimestamp != null
      ? { status: prevStatus, outcome: prevOutcome, timestamp: prevTimestamp }
      : null;
  const history = [...(historyEntry ? [historyEntry] : []), ...(stages[key]?.history ?? [])].slice(
    0,
    HISTORY_LIMIT,
  );

  return {
    ...stages,
    [key]: {
      ...(stages[key] as any),
      status,
      outcome,
      timestamp: receivedAt,
      history,
    },
  } as ProofigStages;
}

/**
 * Proofig may omit notifies for intermediate steps. When a later payload arrives, align linear stages
 * through integrity using `notify-skipped` so we can apply that payload while recording that we did
 * not observe the usual progression.
 */
function catchUpStagesForLateProofigNotify(
  stages: ProofigStages,
  receivedAt: string,
): ProofigStages {
  let s = stages;
  if (!linearStageIsDone(s.subimageDetection?.status)) {
    s = setLinearStage(s, 'subimageDetection', 'notify-skipped', receivedAt);
  }
  if (!linearStageIsDone(s.subimageSelection?.status)) {
    s = setLinearStage(s, 'subimageSelection', 'notify-skipped', receivedAt);
  }
  if (!linearStageIsDone(s.integrityDetection?.status)) {
    s = setLinearStage(s, 'integrityDetection', 'notify-skipped', receivedAt);
  }
  return s;
}

export type ProofigSourceFormat = 'pdf' | 'docx';

/**
 * Initialize every Proofig run with a `documentPreparation` stage.
 * PDF uploads mark prep completed synchronously and start upload; DOCX waits on CONVERTER_TASK.
 */
export function beginProofigPipeline(
  options: { sourceFormat: ProofigSourceFormat; converterJobId?: string },
  current?: ProofigDataSchema,
  receivedAt: string = new Date().toISOString(),
): ProofigDataSchema {
  const base = current ?? MINIMAL_PROOFIG_SERVICE_DATA;
  const stages = { ...ALL_PENDING_STAGES, ...(base.stages ?? MINIMAL_PROOFIG_SERVICE_DATA.stages) };

  if (options.sourceFormat === 'pdf') {
    let updatedStages = setLinearStage(stages, 'documentPreparation', 'completed', receivedAt);
    updatedStages = setLinearStage(updatedStages, 'initialPost', 'processing', receivedAt);
    return {
      ...base,
      preparation: { sourceFormat: 'pdf' },
      stages: updatedStages,
    };
  }

  const converterJobId = options.converterJobId?.trim();
  if (!converterJobId) {
    throw new Error('converterJobId is required when sourceFormat is docx');
  }

  let updatedStages = setLinearStage(stages, 'documentPreparation', 'processing', receivedAt);
  updatedStages = setLinearStage(updatedStages, 'initialPost', 'pending', receivedAt);
  return {
    ...base,
    preparation: { converterJobId, sourceFormat: 'docx' },
    stages: updatedStages,
  };
}

/**
 * Helper used when a DOCX upload begins: mark document preparation in progress and store the
 * converter job id. Leaves `initialPost` pending until PDF conversion completes.
 */
export function startDocumentPreparation(
  converterJobId: string,
  current?: ProofigDataSchema,
  receivedAt: string = new Date().toISOString(),
): ProofigDataSchema {
  return beginProofigPipeline({ sourceFormat: 'docx', converterJobId }, current, receivedAt);
}

/**
 * Helper used when the CONVERTER_TASK job completes successfully.
 */
export function completeDocumentPreparation(
  current?: ProofigDataSchema,
  receivedAt: string = new Date().toISOString(),
): ProofigDataSchema {
  const base = current ?? MINIMAL_PROOFIG_SERVICE_DATA;
  const stages = base.stages ?? MINIMAL_PROOFIG_SERVICE_DATA.stages;
  if (!stages.documentPreparation) return base;
  const updatedStages = setLinearStage(stages, 'documentPreparation', 'completed', receivedAt);
  return {
    ...base,
    stages: updatedStages,
  };
}

/**
 * Helper used when DOCX→PDF conversion fails or is cancelled.
 */
export function markDocumentPreparationError(
  current?: ProofigDataSchema,
  message?: string,
  receivedAt: string = new Date().toISOString(),
): ProofigDataSchema {
  const base = current ?? MINIMAL_PROOFIG_SERVICE_DATA;
  const stages = { ...ALL_PENDING_STAGES, ...(base.stages ?? MINIMAL_PROOFIG_SERVICE_DATA.stages) };
  const updatedStages = setLinearStage(stages, 'documentPreparation', 'error', receivedAt, message);
  return {
    ...base,
    stages: updatedStages,
  };
}

/**
 * Helper used when we initially enqueue a Proofig run.
 * Ensures `initialPost` is marked as `processing` and history is updated correctly.
 */
export function startInitialPostProcessing(
  current?: ProofigDataSchema,
  receivedAt: string = new Date().toISOString(),
): ProofigDataSchema {
  const base = current ?? MINIMAL_PROOFIG_SERVICE_DATA;
  const stages = base.stages ?? MINIMAL_PROOFIG_SERVICE_DATA.stages;
  const updatedStages = setLinearStage(stages, 'initialPost', 'processing', receivedAt);
  return {
    ...base,
    stages: updatedStages,
  };
}

/**
 * Helper used when initial job creation fails.
 * Marks `initialPost` as `error`, preserves history, and stores an error message.
 */
export function markInitialPostError(
  current?: ProofigDataSchema,
  message?: string,
  receivedAt: string = new Date().toISOString(),
): ProofigDataSchema {
  const base = current ?? MINIMAL_PROOFIG_SERVICE_DATA;
  const stages = base.stages ?? MINIMAL_PROOFIG_SERVICE_DATA.stages;
  const updatedStages = setLinearStage(stages, 'initialPost', 'error', receivedAt, message);
  return {
    ...base,
    stages: updatedStages,
  };
}

/**
 * Helper used when the initial POST to Proofig completes successfully (e.g. stream submit done).
 * Transitions initialPost to completed and sets the next linear stage (subimageDetection) to pending.
 */
export function completeInitialPostAndSetSubimageDetectionPending(
  current?: ProofigDataSchema,
  receivedAt: string = new Date().toISOString(),
): ProofigDataSchema {
  const base = current ?? MINIMAL_PROOFIG_SERVICE_DATA;
  const stages = base.stages ?? MINIMAL_PROOFIG_SERVICE_DATA.stages;
  let updatedStages = setLinearStage(stages, 'initialPost', 'completed', receivedAt);
  updatedStages = setLinearStage(updatedStages, 'subimageDetection', 'pending', receivedAt);
  return {
    ...base,
    stages: updatedStages,
  };
}

/**
 * Pure transition function for mapping Proofig notify payloads onto our `serviceData`.
 * Exported for unit testing and reuse.
 */
export function updateStagesAndServiceDataFromValidatedNotifyPayload(
  current: ProofigDataSchema,
  payload: ProofigNotifyPayload,
  receivedAt: string = new Date().toISOString(),
): ProofigDataSchema | null {
  // Ensure we have a full stage object for logic to work (defensive)
  let { stages } = current;
  if (!stages) {
    current = MINIMAL_PROOFIG_SERVICE_DATA;
    stages = current.stages;
  }

  const currentStatuses = {
    initialPost: stages.initialPost?.status,
    subimageDetection: stages.subimageDetection?.status,
    subimageSelection: stages.subimageSelection?.status,
    integrityDetection: stages.integrityDetection?.status,
    resultsReview: stages.resultsReview?.status,
  };

  // defensively check for known states, and if we don't know the state, we ignore the notification.
  if (!KNOWN_STATES.includes(payload.state)) {
    console.warn(
      `[checks-proofig] Unknown state received: ${payload.state}, ignoring notification.`,
    );
    return current;
  }

  if (payload.state === KnownState.Deleted) {
    return {
      ...current,
      deleted: true,
    };
  }

  let updateStages: ProofigStages | null = null;
  switch (payload.state) {
    case KnownState.Processing: {
      if (
        currentStatuses.subimageDetection === 'processing' ||
        currentStatuses.integrityDetection === 'processing'
      ) {
        break;
      }
      if (linearStageIsDone(currentStatuses.integrityDetection)) {
        console.warn(
          `[checks-proofig] Processing state received when not expected, ignoring notification.`,
        );
        break;
      }
      let s = stages;
      if (
        linearStageIsDone(currentStatuses.subimageDetection) &&
        (currentStatuses.subimageSelection === 'pending' ||
          currentStatuses.subimageSelection === 'completed' ||
          currentStatuses.subimageSelection === 'notify-skipped')
      ) {
        if (currentStatuses.subimageSelection === 'pending') {
          s = setLinearStage(s, 'subimageSelection', 'completed', receivedAt);
        }
        updateStages = setLinearStage(s, 'integrityDetection', 'processing', receivedAt);
        break;
      }
      if (
        currentStatuses.initialPost === 'pending' ||
        currentStatuses.initialPost === 'completed'
      ) {
        updateStages = setLinearStage(stages, 'initialPost', 'completed', receivedAt);
        updateStages = setLinearStage(updateStages, 'subimageDetection', 'processing', receivedAt);
        break;
      }
      console.warn(
        `[checks-proofig] Processing state received when not expected, ignoring notification.`,
      );
      break;
    }

    case KnownState.AwaitingSubImageApproval: {
      if (
        linearStageIsDone(currentStatuses.subimageDetection) &&
        currentStatuses.subimageSelection === 'pending'
      ) {
        break;
      }
      let sAwait = stages;
      if (!linearStageIsDone(currentStatuses.subimageDetection)) {
        sAwait = setLinearStage(sAwait, 'subimageDetection', 'completed', receivedAt);
      }
      updateStages = setLinearStage(sAwait, 'subimageSelection', 'pending', receivedAt);
      break;
    }

    case KnownState.AwaitingReview: {
      if (
        linearStageIsDone(currentStatuses.integrityDetection) &&
        stages.resultsReview?.status === 'requested'
      ) {
        break;
      }
      let sRev = stages;
      if (currentStatuses.integrityDetection === 'processing') {
        sRev = setLinearStage(sRev, 'integrityDetection', 'completed', receivedAt);
      } else {
        sRev = catchUpStagesForLateProofigNotify(sRev, receivedAt);
      }
      updateStages = setReviewStage(sRev, 'resultsReview', 'requested', 'pending', receivedAt);
      break;
    }

    case KnownState.ReportClean: {
      const review = stages.resultsReview;
      if (review?.status === 'completed' && review?.outcome === 'clean') {
        break;
      }
      const fromIntegrityProcessing = currentStatuses.integrityDetection === 'processing';
      const integrityWasAlreadyDone = linearStageIsDone(currentStatuses.integrityDetection);
      let sClean = stages;
      if (fromIntegrityProcessing) {
        sClean = setLinearStage(sClean, 'integrityDetection', 'completed', receivedAt);
      } else {
        sClean = catchUpStagesForLateProofigNotify(sClean, receivedAt);
      }
      if (fromIntegrityProcessing) {
        updateStages = setReviewStage(
          sClean,
          'resultsReview',
          'not-requested',
          'clean',
          receivedAt,
        );
      } else if (integrityWasAlreadyDone) {
        updateStages = setReviewStage(sClean, 'resultsReview', 'completed', 'clean', receivedAt);
      } else {
        updateStages = setReviewStage(
          sClean,
          'resultsReview',
          'not-requested',
          'clean',
          receivedAt,
        );
      }
      break;
    }

    case KnownState.ReportFlagged: {
      if (currentStatuses.integrityDetection === 'processing') {
        updateStages = setReviewStage(
          stages,
          'resultsReview',
          'not-requested',
          'flagged',
          receivedAt,
        );
        break;
      }
      const sFlag = catchUpStagesForLateProofigNotify(stages, receivedAt);
      updateStages = setReviewStage(sFlag, 'resultsReview', 'completed', 'flagged', receivedAt);
      break;
    }
  }

  if (!updateStages) return null;

  // Update summary/top-level fields (preserve reportUrl if payload omits it, e.g. Report: Clean)
  const next: ProofigDataSchema = {
    ...current,
    stages: updateStages,
    reportId: payload.report_id ?? current.reportId,
    reportUrl: payload.report_url ?? current.reportUrl,
    summary: {
      state: payload.state,
      subimagesTotal: payload.subimages_total ?? current.summary?.subimagesTotal,
      matchesReview: payload.matches_review ?? current.summary?.matchesReview,
      matchesReport: payload.matches_report ?? current.summary?.matchesReport,
      inspectsReport: payload.inspects_report ?? current.summary?.inspectsReport,
      reportUrl: payload.report_url ?? current.summary?.reportUrl,
      number: payload.number,
      message: payload.message,
      submitReqId: payload.submit_req_id ?? current.summary?.submitReqId,
      receivedAt,
    },
  };

  return next;
}
