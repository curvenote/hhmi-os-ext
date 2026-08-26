import { getFilesForSlot, isDocxOrPdfFile } from '@curvenote/scms-core';

const TEXT_INTEGRITY_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MANUSCRIPT_SLOT = 'manuscript';

/** Text integrity: one or more DOCX/PDF manuscript files, max 100 MB total. */
export function isTextIntegrityUploadEligible(metadata: unknown): boolean {
  const files = getFilesForSlot(metadata, MANUSCRIPT_SLOT).filter(isDocxOrPdfFile);
  if (files.length === 0) return false;
  const total = files.reduce((sum, f) => sum + (typeof f.size === 'number' ? f.size : 0), 0);
  return total > 0 && total <= TEXT_INTEGRITY_MAX_TOTAL_BYTES;
}
