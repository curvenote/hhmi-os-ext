/** Job type: render a Proofig report to PDF (dispatched to the Cloud Run worker). */
export const PROOFIG_PERSIST_PDF = 'PROOFIG_PERSIST_PDF';

/** FAILURE-path cleanup: write persist/render error onto check-run serviceData. */
export const PROOFIG_PERSIST_PDF_FAILURE_CLEANUP = 'PROOFIG_PERSIST_PDF_FAILURE_CLEANUP';
