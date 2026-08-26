import { linearStageIsDone, type TextIntegrityDataSchema } from '../serviceDataSchemas.js';

/**
 * Narrow window before Refresh may claim-start PDF when reportPdfId is still missing.
 * TCA `/report/pdf/start` is not idempotent per externalCheckId — each call returns a new pdf_id.
 */
export const SIMILARITY_PDF_START_GRACE_MS = 10_000;

export function processingCompletedBeyondGrace(
  serviceData: TextIntegrityDataSchema,
  nowMs: number,
): boolean {
  const doneAt = serviceData.stages?.processing?.timestamp;
  if (typeof doneAt !== 'string' || doneAt.trim() === '') return false;
  const parsed = Date.parse(doneAt);
  if (Number.isNaN(parsed)) return false;
  return nowMs - parsed >= SIMILARITY_PDF_START_GRACE_MS;
}

/** Status catch-up in this Refresh: processing was not done before envelopes were applied. */
export function relayStatusLearnedProcessingComplete(
  envelopes: unknown[],
  processingDoneBeforeStatus: boolean,
): boolean {
  if (processingDoneBeforeStatus) return false;
  return envelopes.some((envelope) => {
    if (!envelope || typeof envelope !== 'object') return false;
    return (envelope as { event?: string }).event === 'PROCESSING_PHASE_COMPLETE';
  });
}
