// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextIntegrityTrackEvent } from '../analytics.catalog.js';
import {
  resolveTextIntegrityTerminalOutcome,
  trackTextIntegrityTerminalTransition,
} from './analytics.server.js';
import type { TextIntegrityDataSchema } from '../schema.js';

const mockTrackChecksEventForUser = vi.fn();

vi.mock('@hhmi/checks-shared/analytics/server', () => ({
  trackChecksEvent: vi.fn(),
  trackChecksEventForUser: (...args: unknown[]) => mockTrackChecksEventForUser(...args),
}));

vi.mock('@hhmi/checks-shared/analytics/runContext.server', () => ({
  loadChecksRunAnalyticsContext: vi.fn(),
  runLifecyclePropsFromRow: vi.fn((_run, kind) => ({ checkKind: kind, checkRunId: _run.id })),
}));

const SAMPLE_SUMMARY: NonNullable<TextIntegrityDataSchema['summaryReport']> = {
  submissionId: 'sub-1',
  status: 'COMPLETE',
  timeRequested: '2025-01-01T00:00:00Z',
  overallMatchPercentage: 12,
  internetMatchPercentage: 5,
  publicationMatchPercentage: 3,
  submittedWorksMatchPercentage: 4,
  topMatches: [],
  timeGenerated: '2025-01-01T00:01:00Z',
  topSourceLargestMatchedWordCount: 100,
};

const RUN_ROW = {
  id: 'run-1',
  kind: 'checks-text-integrity',
  work_version_id: 'wv-1',
  created_by_id: 'user-1',
};

function processingCompleteWithoutSummary(): TextIntegrityDataSchema {
  return {
    stages: {
      submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
      processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
      reportGeneration: { status: 'pending', history: [], timestamp: '2025-01-01T00:00:00Z' },
    },
  };
}

describe('resolveTextIntegrityTerminalOutcome', () => {
  it('returns null while processing is incomplete and no summary exists', () => {
    const data: TextIntegrityDataSchema = {
      stages: {
        submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
        processing: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
      },
    };
    expect(resolveTextIntegrityTerminalOutcome(data)).toBeNull();
  });

  it('returns null when processing is done but summaryReport has not arrived yet', () => {
    expect(resolveTextIntegrityTerminalOutcome(processingCompleteWithoutSummary())).toBeNull();
  });

  it('returns null when a preliminary summaryReport arrives before processing completes', () => {
    expect(
      resolveTextIntegrityTerminalOutcome({
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
        summaryReport: {
          ...SAMPLE_SUMMARY,
          status: 'PROCESSING',
          overallMatchPercentage: 6,
        },
      }),
    ).toBeNull();
  });

  it('returns completed when summaryReport is present', () => {
    expect(
      resolveTextIntegrityTerminalOutcome({
        ...processingCompleteWithoutSummary(),
        summaryReport: SAMPLE_SUMMARY,
      }),
    ).toBe('completed');
  });

  it('returns failed on pipeline errors', () => {
    const data: TextIntegrityDataSchema = {
      stages: {
        submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
        processing: {
          status: 'error',
          history: [],
          timestamp: '2025-01-01T00:00:00Z',
          error: 'Provider timeout',
        },
      },
    };
    expect(resolveTextIntegrityTerminalOutcome(data)).toBe('failed');
  });

  it('returns failed when report generation errors without a summary report', () => {
    const data: TextIntegrityDataSchema = {
      stages: {
        submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
        processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
        reportGeneration: {
          status: 'error',
          history: [],
          timestamp: '2025-01-01T00:00:00Z',
          error: 'PDF generation failed',
        },
      },
    };
    expect(resolveTextIntegrityTerminalOutcome(data)).toBe('failed');
  });

  it('returns completed when report generation failed but similarity summary exists', () => {
    const data: TextIntegrityDataSchema = {
      summaryReport: SAMPLE_SUMMARY,
      stages: {
        submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
        processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
        reportGeneration: {
          status: 'error',
          history: [],
          timestamp: '2025-01-01T00:00:00Z',
          error: 'PDF generation failed',
        },
      },
    };
    expect(resolveTextIntegrityTerminalOutcome(data)).toBe('completed');
  });
});

describe('trackTextIntegrityTerminalTransition', () => {
  beforeEach(() => {
    mockTrackChecksEventForUser.mockReset();
  });

  it('does not emit failure when processing completes before summaryReport arrives', async () => {
    const before: TextIntegrityDataSchema = {
      stages: {
        submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
        processing: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
      },
    };
    const after = processingCompleteWithoutSummary();

    await trackTextIntegrityTerminalTransition(RUN_ROW, before, after);

    expect(mockTrackChecksEventForUser).not.toHaveBeenCalled();
  });

  it('does not emit completion when a preliminary summaryReport arrives mid-processing', async () => {
    const before: TextIntegrityDataSchema = {
      stages: {
        submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
        processing: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
      },
    };
    const after: TextIntegrityDataSchema = {
      ...before,
      summaryReport: {
        ...SAMPLE_SUMMARY,
        status: 'PROCESSING',
        overallMatchPercentage: 6,
      },
    };

    await trackTextIntegrityTerminalTransition(RUN_ROW, before, after);

    expect(mockTrackChecksEventForUser).not.toHaveBeenCalled();
  });

  it('emits CHECKS_RUN_COMPLETED when summaryReport arrives on a later webhook', async () => {
    const before = processingCompleteWithoutSummary();
    const after: TextIntegrityDataSchema = {
      ...before,
      summaryReport: SAMPLE_SUMMARY,
    };

    await trackTextIntegrityTerminalTransition(RUN_ROW, before, after);

    expect(mockTrackChecksEventForUser).toHaveBeenCalledWith(
      'user-1',
      TextIntegrityTrackEvent.CHECKS_RUN_COMPLETED,
      expect.objectContaining({ checkRunId: 'run-1' }),
      undefined,
    );
  });

  it('does not emit a second terminal event after completion was tracked', async () => {
    const before: TextIntegrityDataSchema = {
      ...processingCompleteWithoutSummary(),
      summaryReport: SAMPLE_SUMMARY,
    };
    const after: TextIntegrityDataSchema = {
      ...before,
      summaryReport: { ...SAMPLE_SUMMARY, overallMatchPercentage: 7 },
    };

    await trackTextIntegrityTerminalTransition(RUN_ROW, before, after);

    expect(mockTrackChecksEventForUser).not.toHaveBeenCalled();
  });
});
