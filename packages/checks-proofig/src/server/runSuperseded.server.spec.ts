// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { isProofigRunSupersededByRetry } from './runSuperseded.server.js';

describe('isProofigRunSupersededByRetry', () => {
  it('returns false when superseded metadata is absent', () => {
    expect(isProofigRunSupersededByRetry({ retried: false })).toBe(false);
  });

  it('returns true when retried column is set', () => {
    expect(isProofigRunSupersededByRetry({ retried: true })).toBe(true);
  });

  it('returns true when successor_id is set', () => {
    expect(isProofigRunSupersededByRetry({ successor_id: 'new-run-id' })).toBe(true);
  });
});
