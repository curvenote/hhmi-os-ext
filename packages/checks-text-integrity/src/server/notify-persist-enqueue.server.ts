import type { TextIntegrityDataSchema, WebhookBody } from '../schema.js';
import { WebhookEvent } from '../webhookSchemas.js';
import { applyWebhookEvent } from './stateMachine.server.js';
import { shouldPersistSimilarityReport } from './similarity-report-storage.server.js';

/** Service data as it should be after applying this notify webhook (even if the DB update is a no-op). */
export function resolveServiceDataAfterNotifyWebhook(
  current: TextIntegrityDataSchema,
  webhook: WebhookBody,
  receivedAt: string,
): TextIntegrityDataSchema {
  return applyWebhookEvent(current, webhook, receivedAt) ?? current;
}

/**
 * Whether to enqueue TEXT_INTEGRITY_PERSIST_PDF after a notify delivery.
 * Uses post-webhook service data so redelivered REPORT_GENERATION_COMPLETE can retry a failed persist.
 */
export function shouldEnqueuePersistPdfNotify(
  webhook: WebhookBody,
  serviceDataAfterWebhook: TextIntegrityDataSchema,
): boolean {
  return (
    webhook.event === WebhookEvent.ReportGenerationComplete &&
    shouldPersistSimilarityReport(serviceDataAfterWebhook)
  );
}
