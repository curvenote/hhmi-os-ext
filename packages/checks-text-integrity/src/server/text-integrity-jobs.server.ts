import type { JobRegistration } from '@curvenote/scms-core';
import {
  TEXT_INTEGRITY_SUBMIT,
  textIntegritySubmitHandler,
} from './jobs/text-integrity-submit.server.js';
import {
  TEXT_INTEGRITY_PERSIST_PDF,
  textIntegrityPersistPdfHandler,
} from './jobs/text-integrity-persist-pdf.server.js';

export const TEXT_INTEGRITY_JOB_REGISTRATIONS: JobRegistration[] = [
  {
    jobType: TEXT_INTEGRITY_SUBMIT,
    handler: textIntegritySubmitHandler as JobRegistration['handler'],
  },
  {
    jobType: TEXT_INTEGRITY_PERSIST_PDF,
    handler: textIntegrityPersistPdfHandler as JobRegistration['handler'],
    requiresStorageBackend: true,
  },
];
