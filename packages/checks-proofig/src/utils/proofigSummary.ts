import { hasError, KnownState, type ProofigDataSchema } from '../schema.js';

export interface ProofigSummaryCounts {
  total: number;
  matchesReview: number;
  matchesNotBad: number;
  matchesReport: number;
  inspectsReport: number;
  bad: number;
}

export type ProofigResultDisplayState =
  | {
      kind: 'error';
      counts: ProofigSummaryCounts;
    }
  | {
      kind: 'awaiting-review' | 'all-clear' | 'confirmed-all-clear';
      counts: ProofigSummaryCounts;
    }
  | {
      kind: 'manual-problems' | 'problems';
      counts: ProofigSummaryCounts;
      problemCount: number;
    };

function getProofigResultDisplayStateFromCounts(
  counts: ProofigSummaryCounts,
  awaitingHumanReview: boolean,
): ProofigResultDisplayState {
  if (awaitingHumanReview) {
    return { kind: 'awaiting-review', counts };
  }

  if (counts.matchesReview === 0 && counts.matchesReport === 0 && counts.inspectsReport === 0) {
    return { kind: 'all-clear', counts };
  }

  if (counts.matchesReview === 0 && counts.matchesReport === 0 && counts.inspectsReport > 0) {
    return {
      kind: 'manual-problems',
      counts,
      problemCount: counts.inspectsReport,
    };
  }

  if (counts.matchesReview > 0 && counts.matchesReport === 0 && counts.inspectsReport === 0) {
    return { kind: 'confirmed-all-clear', counts };
  }

  return {
    kind: 'problems',
    counts,
    problemCount: counts.bad,
  };
}

/**
 * Derive display counts from proofig metadata summary.
 * Uses API fields as-is: matchedReport / inspectReport / bad from matches_report and inspects_report.
 */
/**
 * True while Proofig is waiting for human review and before a final Report: Clean / Report: Flagged
 * notification. In this window `matches_review` can be non-zero while `matches_report` is still zero,
 * which must not be read as “confirmed all clear”.
 */
export function proofigIsAwaitingHumanReview(proofigData: ProofigDataSchema | undefined): boolean {
  if (!proofigData || proofigData.deleted) return false;

  const rr = proofigData.stages?.resultsReview;
  if (rr?.status === 'completed' && (rr.outcome === 'clean' || rr.outcome === 'flagged')) {
    return false;
  }
  if (rr?.status === 'not-requested' && (rr.outcome === 'clean' || rr.outcome === 'flagged')) {
    return false;
  }

  const summaryState = proofigData.summary?.state;
  if (summaryState === KnownState.ReportClean || summaryState === KnownState.ReportFlagged) {
    return false;
  }

  if (summaryState === KnownState.AwaitingReview) return true;
  if (rr?.status === 'requested' && (rr.outcome === 'pending' || rr.outcome === undefined)) {
    return true;
  }
  return false;
}

export function getProofigSummaryCounts(
  proofigData: ProofigDataSchema | undefined,
): ProofigSummaryCounts {
  const summary = proofigData?.summary;
  const total = summary?.subimagesTotal ?? 0;
  const matchesReview = summary?.matchesReview ?? 0;
  const matchesReport = summary?.matchesReport ?? 0;
  const inspectsReport = summary?.inspectsReport ?? 0;

  return {
    total,
    matchesReview,
    matchesNotBad: Math.max(0, matchesReview - matchesReport),
    matchesReport,
    inspectsReport,
    bad: matchesReport + inspectsReport,
  };
}

/**
 * Shared result-display classification for Proofig result UIs.
 *
 * Proofig can keep a final `flagged` outcome after reviewers resolve/remove all problem
 * images; it updates the counts but does not send a later clean notification. For display
 * purposes, zero confirmed/manual problem counts therefore means an all-clear state.
 */
export function getProofigResultDisplayState(
  proofigData: ProofigDataSchema | undefined,
): ProofigResultDisplayState {
  const counts = getProofigSummaryCounts(proofigData);
  if (hasError(proofigData)) {
    return { kind: 'error', counts };
  }
  const awaitingHumanReview = proofigIsAwaitingHumanReview(proofigData);
  return getProofigResultDisplayStateFromCounts(counts, awaitingHumanReview);
}
