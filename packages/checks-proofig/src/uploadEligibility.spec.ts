// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { WORK_VERSION_DOCX_MIME } from '@curvenote/scms-core';
import { isProofigUploadEligible, resolveProofigUploadEligibility } from './uploadEligibility.js';

describe('resolveProofigUploadEligibility', () => {
  it('requires exactly one manuscript file', () => {
    expect(resolveProofigUploadEligibility({ files: {} })).toEqual({
      status: 'ineligible',
      message: expect.stringContaining('exactly one'),
    });
    expect(
      resolveProofigUploadEligibility({
        files: {
          a: { slot: 'manuscript', type: 'application/pdf', size: 1000 },
          b: { slot: 'manuscript', type: 'application/pdf', size: 1000 },
        },
      }),
    ).toEqual({
      status: 'ineligible',
      message: expect.stringContaining('exactly one'),
    });
  });

  it('accepts one docx or pdf within 50 MB', () => {
    expect(
      resolveProofigUploadEligibility({
        files: {
          a: { slot: 'manuscript', type: 'application/pdf', size: 50 * 1024 * 1024 },
        },
      }),
    ).toEqual({ status: 'eligible' });
    expect(
      resolveProofigUploadEligibility({
        files: {
          a: { slot: 'manuscript', type: WORK_VERSION_DOCX_MIME, size: 1 },
        },
      }),
    ).toEqual({ status: 'eligible' });
  });

  it('warns when image presence is unknown or absent', () => {
    const metadata = {
      files: {
        a: { slot: 'manuscript', type: 'application/pdf', size: 1000 },
      },
    };

    const baseContext = {
      metadata: { title: 'unknown', authors: 'unknown', affiliations: 'unknown' },
    } as const;

    expect(
      resolveProofigUploadEligibility(metadata, {
        ...baseContext,
        document: { images: 'unknown' },
      }),
    ).toEqual({
      status: 'warning',
      message: expect.stringContaining('still in progress'),
    });
    expect(
      resolveProofigUploadEligibility(metadata, {
        ...baseContext,
        document: { images: 'present' },
      }),
    ).toEqual({ status: 'eligible' });
    expect(
      resolveProofigUploadEligibility(metadata, { ...baseContext, document: { images: 'absent' } }),
    ).toEqual({
      status: 'warning',
      message: expect.stringContaining('could not detect any figures'),
    });
  });

  it('rejects oversize or wrong type', () => {
    expect(
      resolveProofigUploadEligibility({
        files: {
          a: { slot: 'manuscript', type: 'application/pdf', size: 50 * 1024 * 1024 + 1 },
        },
      }),
    ).toEqual({
      status: 'ineligible',
      message: expect.stringContaining('50 MB'),
    });
    expect(
      resolveProofigUploadEligibility({
        files: {
          a: { slot: 'manuscript', type: 'image/png', size: 1000 },
        },
      }),
    ).toEqual({
      status: 'ineligible',
      message: expect.stringContaining('DOCX or PDF'),
    });
  });
});

describe('isProofigUploadEligible', () => {
  it('treats warnings as eligible for hard requirement checks', () => {
    const metadata = {
      files: {
        a: { slot: 'manuscript', type: 'application/pdf', size: 1000 },
      },
    };
    const context = {
      document: { images: 'absent' as const },
      metadata: {
        title: 'unknown' as const,
        authors: 'unknown' as const,
        affiliations: 'unknown' as const,
      },
    };

    expect(isProofigUploadEligible(metadata, context)).toBe(true);
  });
});
