import {
  getFilesForSlot,
  isDocxOrPdfFile,
  type UploadCheckEligibilityContext,
  type UploadCheckEligibilityResult,
} from '@curvenote/scms-core';

const PROOFIG_MAX_BYTES = 50 * 1024 * 1024;
const MANUSCRIPT_SLOT = 'manuscript';

/** Proofig: exactly one manuscript file, DOCX or PDF, max 50 MB. */
export function resolveProofigUploadEligibility(
  metadata: unknown,
  context?: UploadCheckEligibilityContext,
): UploadCheckEligibilityResult {
  const files = getFilesForSlot(metadata, MANUSCRIPT_SLOT);
  if (files.length !== 1) {
    return {
      status: 'ineligible',
      message: 'Upload exactly one manuscript file (DOCX or PDF).',
    };
  }

  const f = files[0];
  const size = typeof f.size === 'number' ? f.size : 0;
  if (!isDocxOrPdfFile(f) || size <= 0) {
    return { status: 'ineligible', message: 'File must be DOCX or PDF.' };
  }
  if (size > PROOFIG_MAX_BYTES) {
    return { status: 'ineligible', message: 'File must be 50 MB or smaller.' };
  }

  switch (context?.document.images) {
    case 'absent':
      return {
        status: 'warning',
        message:
          'We could not detect any figures in your document. Proofig may have limited results.',
      };
    case 'unknown':
      return {
        status: 'warning',
        message:
          'Figure detection is still in progress. Results may update once preview completes.',
      };
    default:
      return { status: 'eligible' };
  }
}

/** Hard requirements only; warnings still count as upload-eligible. */
export function isProofigUploadEligible(
  metadata: unknown,
  context?: UploadCheckEligibilityContext,
): boolean {
  return resolveProofigUploadEligibility(metadata, context).status !== 'ineligible';
}
