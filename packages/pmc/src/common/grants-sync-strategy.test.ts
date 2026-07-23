// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { parseSyncStrategy } from './grants-sync-strategy.js';

describe('parseSyncStrategy', () => {
  it('defaults an absent form value to merge', () => {
    expect(parseSyncStrategy(null)).toBe('merge');
  });

  it.each(['merge', 'replace'] as const)('preserves %s', (strategy) => {
    expect(parseSyncStrategy(strategy)).toBe(strategy);
  });

  it('rejects an unknown non-null value', () => {
    expect(parseSyncStrategy('unknown')).toBeUndefined();
  });
});
