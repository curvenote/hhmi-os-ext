// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import {
  columnsForTextIntegrityServiceData,
  resolveTextIntegrityCoarseStatus,
} from './checkRunColumns.server.js';
import type { TextIntegrityDataSchema } from '../schema.js';

const TS = '2025-01-01T00:00:00Z';

function completedRun(
  reportGenerationStatus: 'completed' | 'error' | 'processing',
): TextIntegrityDataSchema {
  return {
    summaryReport: {
      submissionId: 'sub-1',
      status: 'COMPLETE',
      timeRequested: TS,
      overallMatchPercentage: 5,
      internetMatchPercentage: 1,
      publicationMatchPercentage: 1,
      submittedWorksMatchPercentage: 1,
      topMatches: [],
      timeGenerated: TS,
      topSourceLargestMatchedWordCount: 1,
    },
    stages: {
      submission: { status: 'completed', history: [], timestamp: TS },
      processing: { status: 'completed', history: [], timestamp: TS },
      reportGeneration: {
        status: reportGenerationStatus,
        history: [],
        timestamp: TS,
        ...(reportGenerationStatus === 'error' ? { error: 'PDF timeout' } : {}),
      },
    },
  };
}

describe('resolveTextIntegrityCoarseStatus', () => {
  it('stays healthy when only report generation failed after processing completed', () => {
    expect(resolveTextIntegrityCoarseStatus(completedRun('error'))).toBe('healthy');
  });

  it('marks error when processing failed', () => {
    const data = completedRun('completed');
    data.stages!.processing = { status: 'error', history: [], timestamp: TS, error: 'boom' };
    expect(resolveTextIntegrityCoarseStatus(data)).toBe('error');
  });
});

describe('columnsForTextIntegrityServiceData', () => {
  it('clears failed_at when report-only error keeps the run healthy', () => {
    expect(columnsForTextIntegrityServiceData(completedRun('error'))).toEqual({
      status: 'healthy',
      failed_at: null,
    });
  });
});
