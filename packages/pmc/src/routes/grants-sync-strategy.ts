export type FundingSyncStrategy = 'merge' | 'replace';

export function resolveFundingSyncStrategy(value: unknown): FundingSyncStrategy | undefined {
  if (value == null) return 'merge';
  if (value === 'merge' || value === 'replace') return value;
  return undefined;
}
