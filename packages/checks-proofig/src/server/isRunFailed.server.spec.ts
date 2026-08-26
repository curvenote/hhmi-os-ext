// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { isProofigRunFailed } from './isRunFailed.server.js';
import { ALL_PENDING_STAGES } from '../schema.js';

describe('isProofigRunFailed', () => {
  it('returns false for non-proofig kind', () => {
    expect(isProofigRunFailed({ kind: 'other', data: { status: 'error' } })).toBe(false);
  });

  it('returns true when status column is error', () => {
    expect(isProofigRunFailed({ kind: 'proofig', status: 'error', data: {} })).toBe(true);
  });

  it('returns true when legacy top-level data.status is error', () => {
    expect(isProofigRunFailed({ kind: 'proofig', data: { status: 'error' } })).toBe(true);
  });

  it('returns true when any stage has error status', () => {
    expect(
      isProofigRunFailed({
        kind: 'proofig',
        data: {
          status: 'processing',
          serviceData: {
            stages: {
              ...ALL_PENDING_STAGES,
              initialPost: {
                status: 'error',
                error: 'Upload failed',
                history: [],
                timestamp: new Date().toISOString(),
              },
            },
          },
        },
      }),
    ).toBe(true);
  });

  it('returns false for in-progress run', () => {
    expect(
      isProofigRunFailed({
        kind: 'proofig',
        data: {
          status: 'processing',
          serviceData: { stages: ALL_PENDING_STAGES },
        },
      }),
    ).toBe(false);
  });
});
