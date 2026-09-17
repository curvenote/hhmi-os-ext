// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { formatManuscriptId } from '../src/components/utils.js';

describe('formatManuscriptId', () => {
  it('prefixes a bare manuscript number', () => {
    expect(formatManuscriptId('2109555')).toBe('NIHMS2109555');
  });

  it('does not double up an already prefixed id', () => {
    expect(formatManuscriptId('NIHMS2109555')).toBe('NIHMS2109555');
    expect(formatManuscriptId('nihms 2109555')).toBe('NIHMS2109555');
  });

  it('leaves non-numeric manuscript ids alone', () => {
    expect(formatManuscriptId('ABC123')).toBe('ABC123');
  });

  it('returns undefined for missing or blank ids', () => {
    expect(formatManuscriptId(undefined)).toBeUndefined();
    expect(formatManuscriptId(null)).toBeUndefined();
    expect(formatManuscriptId('   ')).toBeUndefined();
  });
});
