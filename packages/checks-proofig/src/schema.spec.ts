// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { hasError, type ProofigDataSchema, getRetrySupersessionInfo } from './schema.js';

const timestamp = '2026-01-01T00:00:00.000Z';

describe('getRetrySupersessionInfo', () => {
  it('returns supersession info when both lineage fields are set', () => {
    expect(
      getRetrySupersessionInfo({
        stages: {
          initialPost: { status: 'error', history: [], timestamp },
        },
        supersededByRunId: 'new-run',
        supersededAt: timestamp,
      } as unknown as ProofigDataSchema),
    ).toEqual({ supersededByRunId: 'new-run', supersededAt: timestamp });
  });

  it('returns null when lineage fields are missing', () => {
    expect(getRetrySupersessionInfo(undefined)).toBeNull();
  });
});

describe('hasError', () => {
  it('returns true when any Proofig stage has errored', () => {
    expect(
      hasError({
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'error', history: [], timestamp, error: 'Failed' },
        },
      } as unknown as ProofigDataSchema),
    ).toBe(true);
  });

  it('returns false when stages are missing or no stage has errored', () => {
    expect(hasError(undefined)).toBe(false);
    expect(
      hasError({
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'processing', history: [], timestamp },
        },
      } as unknown as ProofigDataSchema),
    ).toBe(false);
  });
});
