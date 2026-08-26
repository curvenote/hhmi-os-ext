// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { isTextIntegrityRunFailed } from './isRunFailed.server.js';
import { MINIMAL_TEXT_INTEGRITY_SERVICE_DATA } from '../schema.js';
import { markSubmissionError, markSimilarityPdfJobStartFailed } from './stateMachine.server.js';

describe('isTextIntegrityRunFailed', () => {
  it('returns false for non text-integrity kind', () => {
    expect(isTextIntegrityRunFailed({ kind: 'proofig', data: { status: 'error' } })).toBe(false);
  });

  it('returns true when status column is error', () => {
    expect(
      isTextIntegrityRunFailed({ kind: 'checks-text-integrity', status: 'error', data: {} }),
    ).toBe(true);
  });

  it('returns true when legacy top-level data.status is error', () => {
    expect(
      isTextIntegrityRunFailed({ kind: 'checks-text-integrity', data: { status: 'error' } }),
    ).toBe(true);
  });

  it('returns true when service data has submission error', () => {
    const serviceData = markSubmissionError(MINIMAL_TEXT_INTEGRITY_SERVICE_DATA, 'Relay timeout');
    expect(
      isTextIntegrityRunFailed({
        kind: 'checks-text-integrity',
        data: { status: 'processing', serviceData },
      }),
    ).toBe(true);
  });

  it('returns true when results are shown but summary report is missing', () => {
    expect(
      isTextIntegrityRunFailed({
        kind: 'checks-text-integrity',
        data: {
          status: 'completed',
          serviceData: {
            ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
            stages: {
              submission: { status: 'completed', history: [], timestamp: new Date().toISOString() },
              processing: { status: 'completed', history: [], timestamp: new Date().toISOString() },
            },
            summaryReport: undefined,
          },
        },
      }),
    ).toBe(true);
  });

  it('returns false when only report generation errored after processing completed', () => {
    const serviceData = markSimilarityPdfJobStartFailed(
      {
        ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
        summaryReport: {
          submissionId: 'sub-1',
          status: 'COMPLETE',
          timeRequested: new Date().toISOString(),
          overallMatchPercentage: 5,
          internetMatchPercentage: 1,
          publicationMatchPercentage: 1,
          submittedWorksMatchPercentage: 1,
          topMatches: [],
          timeGenerated: new Date().toISOString(),
          topSourceLargestMatchedWordCount: 1,
        },
        stages: {
          submission: { status: 'completed', history: [], timestamp: new Date().toISOString() },
          processing: { status: 'completed', history: [], timestamp: new Date().toISOString() },
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: new Date().toISOString(),
          },
        },
      },
      'Relay unavailable',
    );
    expect(
      isTextIntegrityRunFailed({
        kind: 'checks-text-integrity',
        status: 'healthy',
        data: { serviceData },
      }),
    ).toBe(false);
  });
});
