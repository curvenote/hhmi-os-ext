// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { KnownState, type ProofigDataSchema } from '../schema.js';
import {
  getProofigWorkListCompactSummaryState,
  getProofigWorkListSummaryState,
} from './proofigWorkListSummaryState.js';
import { SAMPLE_IN_PROGRESS_SUBIMAGE_REVIEW } from '../designs/designSampleData.js';

const receivedAt = '2026-01-01T00:00:00.000Z';

describe('getProofigWorkListSummaryState', () => {
  it('shows awaiting review while Proofig has unreviewed matches and no confirmed problems', () => {
    const state = getProofigWorkListSummaryState({
      summary: {
        state: KnownState.AwaitingReview,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 2,
        matchesReport: 0,
        inspectsReport: 0,
      },
      stages: {
        resultsReview: {
          status: 'requested',
          outcome: 'pending',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'progress',
      countLabel: '2/23',
      label: 'awaiting review',
      icon: 'eye',
      iconClassName: 'text-warning',
      iconStrokeWidth: 2.5,
    });
  });

  it('shows awaiting review even when the results review outcome is not set yet', () => {
    const state = getProofigWorkListSummaryState({
      summary: {
        state: KnownState.AwaitingReview,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 2,
        matchesReport: 0,
        inspectsReport: 0,
      },
      stages: {
        resultsReview: {
          status: 'requested',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'progress',
      countLabel: '2/23',
      label: 'awaiting review',
      icon: 'eye',
      iconClassName: 'text-warning',
      iconStrokeWidth: 2.5,
    });
  });

  it('shows all clear for a final report with no matches or confirmed problems', () => {
    const state = getProofigWorkListSummaryState({
      summary: {
        state: KnownState.ReportClean,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 0,
        matchesReport: 0,
        inspectsReport: 0,
      },
      stages: {
        resultsReview: {
          status: 'completed',
          outcome: 'clean',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'result',
      label: 'all clear',
      filledSegments: 11,
      segmentCount: 11,
      segmentFillClassName: 'bg-success',
    });
  });

  it('shows all clear only after review completes with no confirmed problems', () => {
    const state = getProofigWorkListSummaryState({
      summary: {
        state: KnownState.ReportClean,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 2,
        matchesReport: 0,
        inspectsReport: 0,
      },
      stages: {
        resultsReview: {
          status: 'completed',
          outcome: 'clean',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'result',
      label: 'all clear',
      filledSegments: 11,
      segmentCount: 11,
      segmentFillClassName: 'bg-success',
    });
  });

  it('shows all clear for flagged final reports when resolved counts have no confirmed problems', () => {
    const state = getProofigWorkListSummaryState({
      summary: {
        state: KnownState.ReportFlagged,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 2,
        matchesReport: 0,
        inspectsReport: 0,
      },
      stages: {
        resultsReview: {
          status: 'completed',
          outcome: 'flagged',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'result',
      label: 'all clear',
      filledSegments: 11,
      segmentCount: 11,
      segmentFillClassName: 'bg-success',
    });
  });

  it('shows the problem count label after review completes with confirmed problems', () => {
    const state = getProofigWorkListSummaryState({
      summary: {
        state: KnownState.ReportFlagged,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 4,
        matchesReport: 2,
        inspectsReport: 1,
      },
      stages: {
        resultsReview: {
          status: 'completed',
          outcome: 'flagged',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'result',
      countLabel: '3',
      countClassName: 'text-red-600 dark:text-red-400',
      label: 'problems',
      filledSegments: 3,
      segmentCount: 13,
      segmentFillClassName: 'bg-red-600 dark:bg-red-400',
    });
  });

  it('uses the singular problem label after review completes with one confirmed problem', () => {
    const state = getProofigWorkListSummaryState({
      summary: {
        state: KnownState.ReportFlagged,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 1,
        matchesReport: 1,
        inspectsReport: 0,
      },
      stages: {
        resultsReview: {
          status: 'completed',
          outcome: 'flagged',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'result',
      countLabel: '1',
      countClassName: 'text-red-600 dark:text-red-400',
      label: 'problem',
      filledSegments: 1,
      segmentCount: 13,
      segmentFillClassName: 'bg-red-600 dark:bg-red-400',
    });
  });

  it('falls back to the current in-progress stage label before a final report', () => {
    const state = getProofigWorkListSummaryState({
      stages: {
        initialPost: {
          status: 'processing',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'progress',
      label: 'uploading to proofig',
      icon: 'hourglass',
      iconClassName: 'text-warning',
      iconStrokeWidth: 2.5,
    });
  });

  it('shows an eye icon for sub-image review', () => {
    const state = getProofigWorkListSummaryState({
      stages: {
        initialPost: { status: 'completed', history: [], timestamp: receivedAt },
        subimageDetection: { status: 'completed', history: [], timestamp: receivedAt },
        subimageSelection: { status: 'pending', history: [], timestamp: receivedAt },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'progress',
      label: 'ready for sub-image review',
      icon: 'eye',
      iconClassName: 'text-warning',
      iconStrokeWidth: 2.5,
    });
  });

  it('represents the design-page sub-image review sample as awaiting selection', () => {
    const state = getProofigWorkListSummaryState(SAMPLE_IN_PROGRESS_SUBIMAGE_REVIEW);

    expect(state).toMatchObject({
      kind: 'progress',
      label: 'ready for sub-image review',
      icon: 'eye',
    });
  });
});

describe('getProofigWorkListCompactSummaryState', () => {
  it('uses an eye icon for sub-image review based on the current stage', () => {
    const state = getProofigWorkListCompactSummaryState({
      stages: {
        initialPost: { status: 'completed', history: [], timestamp: receivedAt },
        subimageDetection: { status: 'completed', history: [], timestamp: receivedAt },
        subimageSelection: { status: 'pending', history: [], timestamp: receivedAt },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'progress',
      icon: 'eye',
      ariaLabel: 'ready for sub-image review',
    });
  });

  it('uses an hourglass icon for in-progress states', () => {
    const state = getProofigWorkListCompactSummaryState({
      stages: {
        initialPost: { status: 'processing', history: [], timestamp: receivedAt },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'progress',
      icon: 'hourglass',
      ariaLabel: 'uploading to proofig',
    });
  });

  it('uses an eye icon for awaiting review when counts are available', () => {
    const state = getProofigWorkListCompactSummaryState({
      summary: {
        state: KnownState.AwaitingReview,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 2,
        matchesReport: 0,
        inspectsReport: 0,
      },
      stages: {
        resultsReview: {
          status: 'requested',
          outcome: 'pending',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'progress',
      icon: 'eye',
      ariaLabel: '2/23 awaiting review',
    });
  });

  it('uses an eye icon for awaiting review when counts are not available', () => {
    const state = getProofigWorkListCompactSummaryState({
      summary: {
        state: KnownState.AwaitingReview,
        receivedAt,
      },
      stages: {
        resultsReview: {
          status: 'requested',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'progress',
      icon: 'eye',
      ariaLabel: 'awaiting review',
    });
  });

  it('uses only the numeric problem count for problem states', () => {
    const state = getProofigWorkListCompactSummaryState({
      summary: {
        state: KnownState.ReportFlagged,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 4,
        matchesReport: 2,
        inspectsReport: 1,
      },
      stages: {
        resultsReview: {
          status: 'completed',
          outcome: 'flagged',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'result',
      countLabel: '3',
      countClassName: 'text-red-600 dark:text-red-400',
      label: 'problems',
      filledSegments: 3,
      segmentCount: 13,
      segmentFillClassName: 'bg-red-600 dark:bg-red-400',
    });
  });

  it('keeps the label for compact all-clear states', () => {
    const state = getProofigWorkListCompactSummaryState({
      summary: {
        state: KnownState.ReportClean,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 0,
        matchesReport: 0,
        inspectsReport: 0,
      },
      stages: {
        resultsReview: {
          status: 'completed',
          outcome: 'clean',
          history: [],
          timestamp: receivedAt,
        },
      },
    } as unknown as ProofigDataSchema);

    expect(state).toEqual({
      kind: 'result',
      label: 'all clear',
      filledSegments: 11,
      segmentCount: 11,
      segmentFillClassName: 'bg-success',
    });
  });
});
