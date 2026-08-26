import type { ProofigDataSchema } from '../schema.js';
import { ALL_PENDING_STAGES, getCurrentProofigStage } from '../schema.js';
import { getProofigResultDisplayState } from '../utils/proofigSummary.js';
import { ui } from '@curvenote/scms-core';
import { STAGE_LABELS } from './ProofigProgressComponent.js';

interface ProofigSummaryBadgeProps {
  metadata: ProofigDataSchema | undefined;
}

/**
 * Summary badge for timeline: "All clear", "X problems", "Awaiting review", or current stage.
 * Used when the platform renders a check service run item (e.g. work details timeline).
 */
export function ProofigSummaryBadge({ metadata }: ProofigSummaryBadgeProps) {
  const stages = { ...ALL_PENDING_STAGES, ...metadata?.stages };
  const { currentStage, currentStageData } = getCurrentProofigStage(stages);
  const resultDisplayState = getProofigResultDisplayState(metadata);
  const isAtResults = currentStage === 'resultsReview';
  const outcome = metadata?.stages?.resultsReview?.outcome;

  if (resultDisplayState.kind === 'error') {
    return (
      <ui.Badge variant="destructive" size="xs" className="uppercase tracking-wide min-w-[80px]">
        Error
      </ui.Badge>
    );
  }

  if (resultDisplayState.kind === 'awaiting-review') {
    return (
      <ui.Badge variant="warning" size="xs" className="uppercase tracking-wide min-w-[80px]">
        Awaiting review
      </ui.Badge>
    );
  }

  // In progress: show current stage label with color by status (pending, processing, completed, error)
  if (!isAtResults || outcome === undefined) {
    const status = (currentStageData as { status?: string } | undefined)?.status;
    if (status === 'error') {
      return (
        <ui.Badge variant="destructive" size="xs" className="uppercase tracking-wide min-w-[80px]">
          Error
        </ui.Badge>
      );
    }
    const label = STAGE_LABELS[currentStage] ?? 'In progress';
    const variant =
      status === 'completed' || status === 'notify-skipped'
        ? ('success' as const)
        : status === 'processing'
          ? ('primary' as const)
          : ('warning' as const); // pending or unknown
    return (
      <ui.Badge variant={variant} size="xs" className="uppercase tracking-wide min-w-[80px]">
        {label}
      </ui.Badge>
    );
  }

  // Results: all clear
  if (
    resultDisplayState.kind === 'all-clear' ||
    resultDisplayState.kind === 'confirmed-all-clear'
  ) {
    return (
      <ui.Badge variant="success" size="xs" className="uppercase tracking-wide min-w-[80px]">
        All clear
      </ui.Badge>
    );
  }

  if (resultDisplayState.kind === 'manual-problems' || resultDisplayState.kind === 'problems') {
    return (
      <ui.Badge variant="destructive" size="xs" className="uppercase tracking-wide min-w-[80px]">
        {resultDisplayState.problemCount}{' '}
        {resultDisplayState.problemCount === 1 ? 'problem' : 'problems'} found
      </ui.Badge>
    );
  }

  return null;
}
