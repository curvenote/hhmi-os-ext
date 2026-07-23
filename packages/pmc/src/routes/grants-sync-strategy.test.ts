// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { resolveFundingSyncStrategy } from './grants-sync-strategy.js';

describe('resolveFundingSyncStrategy', () => {
  it('defaults an absent form value to merge', () => {
    expect(resolveFundingSyncStrategy(null)).toBe('merge');
  });

  it.each(['merge', 'replace'] as const)('preserves %s', (strategy) => {
    expect(resolveFundingSyncStrategy(strategy)).toBe(strategy);
  });

  it('rejects an unknown non-null value', () => {
    expect(resolveFundingSyncStrategy('unknown')).toBeUndefined();
  });
});
