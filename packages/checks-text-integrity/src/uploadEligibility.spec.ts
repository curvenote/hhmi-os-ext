// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { isTextIntegrityUploadEligible } from './uploadEligibility.js';

describe('isTextIntegrityUploadEligible', () => {
  it('requires at least one docx or pdf in manuscript slot', () => {
    expect(isTextIntegrityUploadEligible({ files: {} })).toBe(false);
    expect(
      isTextIntegrityUploadEligible({
        files: {
          a: { slot: 'figures', type: 'image/png', size: 1000 },
        },
      }),
    ).toBe(false);
  });

  it('allows multiple files within 100 MB total', () => {
    expect(
      isTextIntegrityUploadEligible({
        files: {
          a: { slot: 'manuscript', type: 'application/pdf', size: 40 * 1024 * 1024 },
          b: { slot: 'manuscript', type: 'application/pdf', size: 40 * 1024 * 1024 },
        },
      }),
    ).toBe(true);
  });

  it('rejects when total exceeds 100 MB', () => {
    expect(
      isTextIntegrityUploadEligible({
        files: {
          a: { slot: 'manuscript', type: 'application/pdf', size: 60 * 1024 * 1024 },
          b: { slot: 'manuscript', type: 'application/pdf', size: 50 * 1024 * 1024 },
        },
      }),
    ).toBe(false);
  });
});
