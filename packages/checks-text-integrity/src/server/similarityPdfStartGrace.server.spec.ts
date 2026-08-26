import { describe, expect, it } from 'vitest';
import type { TextIntegrityDataSchema } from '../serviceDataSchemas.js';
import {
  processingCompletedBeyondGrace,
  relayStatusLearnedProcessingComplete,
  SIMILARITY_PDF_START_GRACE_MS,
} from './similarityPdfStartGrace.server.js';

function serviceDataWithProcessingTimestamp(timestamp: string): TextIntegrityDataSchema {
  return {
    stages: {
      submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
      processing: { status: 'completed', history: [], timestamp },
      reportGeneration: { status: 'pending', history: [], timestamp: '2025-01-01T00:00:00Z' },
    },
  };
}

describe('similarityPdfStartGrace', () => {
  it('blocks until the grace window elapses', () => {
    const now = Date.parse('2025-01-01T00:00:20Z');
    const doneAt = '2025-01-01T00:00:15Z';
    expect(processingCompletedBeyondGrace(serviceDataWithProcessingTimestamp(doneAt), now)).toBe(
      false,
    );
    expect(
      processingCompletedBeyondGrace(
        serviceDataWithProcessingTimestamp(doneAt),
        now + SIMILARITY_PDF_START_GRACE_MS,
      ),
    ).toBe(true);
  });

  it('allows at the grace boundary', () => {
    const doneAt = '2025-01-01T00:00:00Z';
    expect(
      processingCompletedBeyondGrace(
        serviceDataWithProcessingTimestamp(doneAt),
        Date.parse(doneAt) + SIMILARITY_PDF_START_GRACE_MS,
      ),
    ).toBe(true);
  });

  it('fails closed when processing timestamp is missing or unparseable', () => {
    const now = Date.now();
    expect(
      processingCompletedBeyondGrace(
        {
          stages: {
            submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          },
        },
        now,
      ),
    ).toBe(false);
    expect(
      processingCompletedBeyondGrace(serviceDataWithProcessingTimestamp('not-a-date'), now),
    ).toBe(false);
    expect(processingCompletedBeyondGrace(serviceDataWithProcessingTimestamp('   '), now)).toBe(
      false,
    );
  });

  it('detects processing catch-up only when processing was not already done', () => {
    const envelopes = [{ event: 'PROCESSING_PHASE_COMPLETE' }];
    expect(relayStatusLearnedProcessingComplete(envelopes, false)).toBe(true);
    expect(relayStatusLearnedProcessingComplete(envelopes, true)).toBe(false);
    expect(relayStatusLearnedProcessingComplete([], false)).toBe(false);
  });
});
