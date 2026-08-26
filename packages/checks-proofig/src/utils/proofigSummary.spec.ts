// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, test } from 'vitest';
import { KnownState, type ProofigDataSchema } from '../schema.js';
import {
  getProofigResultDisplayState,
  getProofigSummaryCounts,
  proofigIsAwaitingHumanReview,
} from './proofigSummary.js';

const receivedAt = '2026-01-01T00:00:00.000Z';

describe('getProofigSummaryCounts', () => {
  test.each([
    {
      description: 'undefined proofig data',
      data: undefined,
      expected: {
        total: 0,
        matchesReview: 0,
        matchesNotBad: 0,
        matchesReport: 0,
        inspectsReport: 0,
        bad: 0,
      },
    },
    {
      description: 'proofig data without summary',
      data: {} as ProofigDataSchema,
      expected: {
        total: 0,
        matchesReview: 0,
        matchesNotBad: 0,
        matchesReport: 0,
        inspectsReport: 0,
        bad: 0,
      },
    },
    {
      description: 'no matches to review',
      data: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 10,
          matchesReview: 0,
          matchesReport: 0,
          inspectsReport: 0,
        },
      } as ProofigDataSchema,
      expected: {
        total: 10,
        matchesReview: 0,
        matchesNotBad: 0,
        matchesReport: 0,
        inspectsReport: 0,
        bad: 0,
      },
    },
    {
      description: 'no matches to review but inspects in report',
      data: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 10,
          matchesReview: 0,
          matchesReport: 0,
          inspectsReport: 2,
        },
      } as ProofigDataSchema,
      expected: {
        total: 10,
        matchesReview: 0,
        matchesNotBad: 0,
        matchesReport: 0,
        inspectsReport: 2,
        bad: 2,
      },
    },
    {
      description: 'some matches to review, no bad (yet)',
      data: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 10,
          matchesReview: 5,
          matchesReport: 0,
          inspectsReport: 0,
        },
      } as ProofigDataSchema,
      expected: {
        total: 10,
        matchesReview: 5,
        matchesNotBad: 5,
        matchesReport: 0,
        inspectsReport: 0,
        bad: 0,
      },
    },
    {
      description: 'some matches to review, some bad',
      data: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 10,
          matchesReview: 5,
          matchesReport: 2,
          inspectsReport: 0,
        },
      } as ProofigDataSchema,
      expected: {
        total: 10,
        matchesReview: 5,
        matchesNotBad: 3,
        matchesReport: 2,
        inspectsReport: 0,
        bad: 2,
      },
    },
    {
      description: 'some matches to review, none bad but inspect',
      data: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 10,
          matchesReview: 5,
          matchesReport: 0,
          inspectsReport: 1,
        },
      } as ProofigDataSchema,
      expected: {
        total: 10,
        matchesReview: 5,
        matchesNotBad: 5,
        matchesReport: 0,
        inspectsReport: 1,
        bad: 1,
      },
    },
    {
      description: 'matches and inspect in report',
      data: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 10,
          matchesReview: 6,
          matchesReport: 2,
          inspectsReport: 1,
        },
      } as ProofigDataSchema,
      expected: {
        total: 10,
        matchesReview: 6,
        matchesNotBad: 4,
        matchesReport: 2,
        inspectsReport: 1,
        bad: 3,
      },
    },
    {
      description:
        'matches_report exceeds matches_review (clamps matchesNotBad; trusts API counts for bad)',
      data: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 10,
          matchesReview: 3,
          matchesReport: 5,
          inspectsReport: 0,
        },
      } as ProofigDataSchema,
      expected: {
        total: 10,
        matchesReview: 3,
        matchesNotBad: 0,
        matchesReport: 5,
        inspectsReport: 0,
        bad: 5,
      },
    },
    {
      description: 'matches_review exceeds subimages_total (API inconsistency)',
      data: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 5,
          matchesReview: 10,
          matchesReport: 0,
          inspectsReport: 0,
        },
      } as ProofigDataSchema,
      expected: {
        total: 5,
        matchesReview: 10,
        matchesNotBad: 10,
        matchesReport: 0,
        inspectsReport: 0,
        bad: 0,
      },
    },
    {
      description: 'subimages_total is zero',
      data: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 0,
          matchesReview: 0,
          matchesReport: 0,
          inspectsReport: 0,
        },
      } as ProofigDataSchema,
      expected: {
        total: 0,
        matchesReview: 0,
        matchesNotBad: 0,
        matchesReport: 0,
        inspectsReport: 0,
        bad: 0,
      },
    },
    {
      description: 'summary present but numeric fields omitted',
      data: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
        },
      } as ProofigDataSchema,
      expected: {
        total: 0,
        matchesReview: 0,
        matchesNotBad: 0,
        matchesReport: 0,
        inspectsReport: 0,
        bad: 0,
      },
    },
  ])('$description', ({ data, expected }) => {
    expect(getProofigSummaryCounts(data)).toEqual(expected);
  });
});

describe('proofigIsAwaitingHumanReview', () => {
  test('false when data is undefined', () => {
    expect(proofigIsAwaitingHumanReview(undefined)).toBe(false);
  });

  test('false when run is deleted', () => {
    expect(
      proofigIsAwaitingHumanReview({
        deleted: true,
        summary: { state: KnownState.AwaitingReview, receivedAt },
      } as ProofigDataSchema),
    ).toBe(false);
  });

  test('true when summary state is Awaiting: Review', () => {
    expect(
      proofigIsAwaitingHumanReview({
        summary: { state: KnownState.AwaitingReview, receivedAt },
      } as ProofigDataSchema),
    ).toBe(true);
  });

  test('true when resultsReview is requested with pending outcome (matches live notify shape)', () => {
    expect(
      proofigIsAwaitingHumanReview({
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          matchesReview: 1,
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
      } as unknown as ProofigDataSchema),
    ).toBe(true);
  });

  test('true when summary state is Awaiting: Review even if an earlier stage errored', () => {
    expect(
      proofigIsAwaitingHumanReview({
        summary: { state: KnownState.AwaitingReview, receivedAt },
        stages: {
          initialPost: { status: 'completed', history: [], timestamp: receivedAt },
          subimageDetection: {
            status: 'error',
            error: 'Failed',
            history: [],
            timestamp: receivedAt,
          },
        },
      } as unknown as ProofigDataSchema),
    ).toBe(true);
  });

  test('false after Report: Clean completed', () => {
    expect(
      proofigIsAwaitingHumanReview({
        summary: { state: KnownState.ReportClean, receivedAt },
        stages: {
          resultsReview: {
            status: 'completed',
            outcome: 'clean',
            history: [],
            timestamp: receivedAt,
          },
        },
      } as unknown as ProofigDataSchema),
    ).toBe(false);
  });

  test('false after Report: Flagged completed', () => {
    expect(
      proofigIsAwaitingHumanReview({
        summary: { state: KnownState.ReportFlagged, receivedAt },
        stages: {
          resultsReview: {
            status: 'completed',
            outcome: 'flagged',
            history: [],
            timestamp: receivedAt,
          },
        },
      } as unknown as ProofigDataSchema),
    ).toBe(false);
  });

  test('false when summary already Report: Clean even if stages are inconsistent', () => {
    expect(
      proofigIsAwaitingHumanReview({
        summary: { state: KnownState.ReportClean, receivedAt },
        stages: {
          resultsReview: {
            status: 'requested',
            outcome: 'pending',
            history: [],
            timestamp: receivedAt,
          },
        },
      } as unknown as ProofigDataSchema),
    ).toBe(false);
  });
});

describe('getProofigResultDisplayState', () => {
  test('classifies errored runs as error before count-derived all-clear states', () => {
    expect(
      getProofigResultDisplayState({
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 10,
          matchesReview: 2,
          matchesReport: 0,
          inspectsReport: 0,
        },
        stages: {
          initialPost: { status: 'completed', history: [], timestamp: receivedAt },
          subimageDetection: { status: 'completed', history: [], timestamp: receivedAt },
          subimageSelection: { status: 'completed', history: [], timestamp: receivedAt },
          integrityDetection: { status: 'completed', history: [], timestamp: receivedAt },
          resultsReview: {
            status: 'error',
            outcome: 'pending',
            error: 'Failed',
            history: [],
            timestamp: receivedAt,
          },
        },
      } as unknown as ProofigDataSchema).kind,
    ).toBe('error');
  });

  test('classifies awaiting review before count-derived all-clear states', () => {
    expect(
      getProofigResultDisplayState({
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
      } as unknown as ProofigDataSchema).kind,
    ).toBe('awaiting-review');
  });

  test('classifies no matches and no problems as all clear', () => {
    expect(
      getProofigResultDisplayState({
        summary: {
          state: KnownState.ReportClean,
          receivedAt,
          subimagesTotal: 23,
          matchesReview: 0,
          matchesReport: 0,
          inspectsReport: 0,
        },
      } as ProofigDataSchema).kind,
    ).toBe('all-clear');
  });

  test('classifies resolved flagged reports with zero bad counts as confirmed all clear', () => {
    const state = getProofigResultDisplayState({
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

    expect(state.kind).toBe('confirmed-all-clear');
    expect(state.counts.bad).toBe(0);
  });

  test('classifies manual-only problems separately from Proofig-confirmed problems', () => {
    const state = getProofigResultDisplayState({
      summary: {
        state: KnownState.ReportFlagged,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 0,
        matchesReport: 0,
        inspectsReport: 2,
      },
    } as ProofigDataSchema);

    expect(state.kind).toBe('manual-problems');
    if (state.kind !== 'manual-problems') throw new Error('Expected manual-problems display state');
    expect(state.problemCount).toBe(2);
  });

  test('classifies Proofig-confirmed problems with a total problem count', () => {
    const state = getProofigResultDisplayState({
      summary: {
        state: KnownState.ReportFlagged,
        receivedAt,
        subimagesTotal: 23,
        matchesReview: 4,
        matchesReport: 2,
        inspectsReport: 1,
      },
    } as ProofigDataSchema);

    expect(state.kind).toBe('problems');
    if (state.kind !== 'problems') throw new Error('Expected problems display state');
    expect(state.problemCount).toBe(3);
  });
});
