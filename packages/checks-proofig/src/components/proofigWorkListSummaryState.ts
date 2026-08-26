import { KnownState, type ProofigDataSchema } from '../schema.js';
import { ALL_PENDING_STAGES, getCurrentProofigStage, hasError } from '../schema.js';
import { getProofigResultDisplayState, getProofigSummaryCounts } from '../utils/proofigSummary.js';
import { STAGE_LABELS } from './ProofigProgressComponent.js';
import {
  PROOFIG_RESULT_ALL_CLEAR_SEGMENT_COUNT,
  PROOFIG_RESULT_PROBLEMS_SEGMENT_COUNT,
  proofigResultFilledSegmentCount,
} from './ProofigResultSegmentBar.js';

/** Brighter than `destructive` in dark mode (theme token is ~31% lightness). */
export const PROOFIG_WORK_LIST_PROBLEM_COUNT_CLASS = 'text-red-600 dark:text-red-400';
export const PROOFIG_WORK_LIST_PROBLEM_SEGMENT_FILL_CLASS = 'bg-red-600 dark:bg-red-400';
export const PROOFIG_WORK_LIST_ERROR_ICON_CLASS = 'text-red-600 dark:text-red-400';

function workListStageLabel(stage: keyof typeof STAGE_LABELS): string {
  return (STAGE_LABELS[stage] ?? 'in progress').toLowerCase();
}

export type ProofigWorkListProgressIcon = 'hourglass' | 'eye' | 'circle-x';

export type ProofigWorkListProgressState = {
  kind: 'progress';
  label: string;
  /** Ratio shown in review color before the label (e.g. `3/24 awaiting review`). */
  countLabel?: string;
  icon: ProofigWorkListProgressIcon;
  iconClassName: string;
  iconStrokeWidth?: number;
};

export type ProofigWorkListResultState = {
  kind: 'result';
  label: string;
  countLabel?: string;
  countClassName?: string;
  filledSegments: number;
  segmentCount: number;
  segmentFillClassName: string;
};

export type ProofigWorkListSummaryState = ProofigWorkListProgressState | ProofigWorkListResultState;

export type ProofigWorkListCompactSummaryState =
  | {
      kind: 'progress';
      icon: ProofigWorkListProgressIcon;
      ariaLabel: string;
    }
  | ProofigWorkListResultState;

function awaitingReviewState(matchesReview: number, total: number): ProofigWorkListProgressState {
  if (total > 0) {
    return {
      kind: 'progress',
      countLabel: `${matchesReview}/${total}`,
      label: 'awaiting review',
      icon: 'eye',
      iconClassName: 'text-warning',
      iconStrokeWidth: 2.5,
    };
  }
  return progressState('awaiting review', 'eye', 'text-warning', 2.5);
}

function progressState(
  label: string,
  icon: ProofigWorkListProgressIcon,
  iconClassName: string,
  iconStrokeWidth?: number,
): ProofigWorkListProgressState {
  return { kind: 'progress', label, icon, iconClassName, iconStrokeWidth };
}

function problemsResultState(problemCount: number): ProofigWorkListResultState {
  return {
    kind: 'result',
    countLabel: String(problemCount),
    countClassName: PROOFIG_WORK_LIST_PROBLEM_COUNT_CLASS,
    label: problemCount === 1 ? 'problem' : 'problems',
    filledSegments: proofigResultFilledSegmentCount(
      problemCount,
      PROOFIG_RESULT_PROBLEMS_SEGMENT_COUNT,
    ),
    segmentCount: PROOFIG_RESULT_PROBLEMS_SEGMENT_COUNT,
    segmentFillClassName: PROOFIG_WORK_LIST_PROBLEM_SEGMENT_FILL_CLASS,
  };
}

function allClearResultState(): ProofigWorkListResultState {
  return {
    kind: 'result',
    label: 'all clear',
    filledSegments: PROOFIG_RESULT_ALL_CLEAR_SEGMENT_COUNT,
    segmentCount: PROOFIG_RESULT_ALL_CLEAR_SEGMENT_COUNT,
    segmentFillClassName: 'bg-success',
  };
}

export function getProofigWorkListSummaryState(
  metadata: ProofigDataSchema | undefined,
): ProofigWorkListSummaryState {
  const stages = { ...ALL_PENDING_STAGES, ...metadata?.stages };
  const { currentStage, currentStageData } = getCurrentProofigStage(stages);
  const resultDisplayState = getProofigResultDisplayState(metadata);
  const { total, matchesReview } = resultDisplayState.counts;

  if (resultDisplayState.kind === 'error' || hasError(metadata)) {
    return progressState('error', 'circle-x', PROOFIG_WORK_LIST_ERROR_ICON_CLASS);
  }

  const reportOutcome = metadata?.stages?.resultsReview?.outcome;
  const summaryState = metadata?.summary?.state;
  const hasFinalReport =
    reportOutcome === 'clean' ||
    reportOutcome === 'flagged' ||
    summaryState === KnownState.ReportClean ||
    summaryState === KnownState.ReportFlagged;

  if (resultDisplayState.kind === 'awaiting-review') {
    return awaitingReviewState(matchesReview, total);
  }

  if (hasFinalReport) {
    if (
      resultDisplayState.kind === 'all-clear' ||
      resultDisplayState.kind === 'confirmed-all-clear'
    ) {
      return allClearResultState();
    }
    if (resultDisplayState.kind === 'manual-problems' || resultDisplayState.kind === 'problems') {
      return problemsResultState(resultDisplayState.problemCount);
    }
  }

  if (currentStage === 'subimageSelection') {
    return progressState(workListStageLabel('subimageSelection'), 'eye', 'text-warning', 2.5);
  }

  const status = (currentStageData as { status?: string } | undefined)?.status;
  if (status === 'error') {
    return progressState('error', 'circle-x', PROOFIG_WORK_LIST_ERROR_ICON_CLASS);
  }

  const stageLabel = workListStageLabel(currentStage);
  return progressState(stageLabel, 'hourglass', 'text-warning', 2.5);
}

export function getProofigWorkListCompactSummaryState(
  metadata: ProofigDataSchema | undefined,
): ProofigWorkListCompactSummaryState {
  const summaryState = getProofigWorkListSummaryState(metadata);

  if (summaryState.kind === 'progress') {
    const ariaLabel = summaryState.countLabel
      ? `${summaryState.countLabel} ${summaryState.label}`
      : summaryState.label;
    return {
      kind: 'progress',
      icon: summaryState.icon,
      ariaLabel,
    };
  }

  const { bad } = getProofigSummaryCounts(metadata);
  const isProblemState =
    summaryState.segmentFillClassName === PROOFIG_WORK_LIST_PROBLEM_SEGMENT_FILL_CLASS && bad > 0;

  if (isProblemState) {
    return {
      ...summaryState,
      countLabel: String(bad),
      label: bad === 1 ? 'problem' : 'problems',
      filledSegments: proofigResultFilledSegmentCount(bad, PROOFIG_RESULT_PROBLEMS_SEGMENT_COUNT),
    };
  }

  return summaryState;
}
