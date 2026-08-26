import type { FileUploadConfig } from '@curvenote/scms-core';

/**
 * Manuscript slot for the integrity flow: single PDF, 50MB max.
 * Keep `slot: 'manuscript'` so WorkFileUpload still targets the platform upload route.
 */
export const MANUSCRIPT_UPLOAD_CONFIG: FileUploadConfig = {
  slot: 'manuscript',
  label: 'Manuscript',
  icon: 'file',
  description: 'Upload your manuscript as a single PDF (max 50MB)',
  optional: false,
  multiple: false,
  maxFiles: 1,
  accept: '.pdf,application/pdf',
  mimeTypes: ['application/pdf'],
  maxSize: 50 * 1024 * 1024, // 50MB
  hideFileCount: false,
  requireLabel: false,
};
