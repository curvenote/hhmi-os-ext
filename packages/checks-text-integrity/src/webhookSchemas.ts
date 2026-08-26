import { z } from 'zod';
import type { ZodIssue } from 'zod';

/**
 * Provider webhook event names.
 * Validated against the events emitted by the checks-relay text integrity plugin.
 */
export enum WebhookEvent {
  SubmissionComplete = 'SUBMISSION_COMPLETE',
  SubmissionFailed = 'SUBMISSION_FAILED',
  ProcessingPhaseStarted = 'PROCESSING_PHASE_STARTED',
  ProcessingPhaseComplete = 'PROCESSING_PHASE_COMPLETE',
  ProcessingPhaseFailed = 'PROCESSING_PHASE_FAILED',
  ReportGenerationStarted = 'REPORT_GENERATION_STARTED',
  ReportGenerationComplete = 'REPORT_GENERATION_COMPLETE',
  ReportGenerationFailed = 'REPORT_GENERATION_FAILED',
}

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = Object.values(WebhookEvent);

export const WebhookEventSchema = z.nativeEnum(WebhookEvent);

/**
 * Zod schema for the outer webhook body forwarded by checks-relay.
 */
export const WebhookBodySchema = z.object({
  event: WebhookEventSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  payload: z
    .object({
      status: z.enum(['PROCESSING', 'SUCCESS', 'FAILED']).optional(),
      /** Canonical relay similarity snapshot (preferred over legacy provider_payload). */
      similarity_report: z.unknown().optional(),
      provider_payload: z.unknown().optional(),
      error_message: z.string().optional(),
      error_code: z.string().optional(),
      report: z
        .object({
          report_id: z.string().optional(),
          report_pdf_url: z.string().optional(),
          mime_type: z.string().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
});

export type WebhookBody = z.infer<typeof WebhookBodySchema>;

// ---------------------------------------------------------------------------
// checks-relay notify envelope (RelayNotifyEnvelope-compatible)
// ---------------------------------------------------------------------------

export const RelayNotifyEnvelopeSchema = z.object({
  event: z.string(),
  check_id: z.string().optional(),
  client_id: z.string().optional(),
  service_name: z.string().optional(),
  occurred_at: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RelayNotifyEnvelopeParsed = z.infer<typeof RelayNotifyEnvelopeSchema>;

export type ParsedNotifyWebhookResult =
  | { ok: true; webhook: WebhookBody }
  | { ok: true; noop: true }
  | { ok: false; issues: ZodIssue[] };

function mapRelayEnvelopeToWebhookBody(env: RelayNotifyEnvelopeParsed): WebhookBody | 'noop' {
  const payload = env.payload;
  const withMetadata = (event: WebhookEvent): WebhookBody => ({
    event,
    payload,
    ...(env.metadata ? { metadata: env.metadata } : {}),
  });
  switch (env.event) {
    case 'UPLOAD_PENDING':
      return 'noop';
    case 'UPLOAD_ACCEPTED':
    case 'UPLOAD_COMPLETE':
      return withMetadata(WebhookEvent.SubmissionComplete);
    case 'UPLOAD_FAILED':
      return withMetadata(WebhookEvent.SubmissionFailed);
    case 'PROCESSING_PHASE_STARTED':
      return withMetadata(WebhookEvent.ProcessingPhaseStarted);
    case 'PROCESSING_PHASE_COMPLETE':
      return withMetadata(WebhookEvent.ProcessingPhaseComplete);
    case 'PROCESSING_PHASE_FAILED':
      return withMetadata(WebhookEvent.ProcessingPhaseFailed);
    case 'REPORT_GENERATION_STARTED':
      return withMetadata(WebhookEvent.ReportGenerationStarted);
    case 'REPORT_GENERATION_COMPLETE':
      return withMetadata(WebhookEvent.ReportGenerationComplete);
    case 'REPORT_GENERATION_FAILED':
      return withMetadata(WebhookEvent.ReportGenerationFailed);
    default:
      console.warn(
        `[checks-text-integrity] Unhandled relay notify event "${env.event}", accepting with no state change`,
      );
      return 'noop';
  }
}

/**
 * Accept legacy `{ event, payload }` bodies or full relay notify envelopes.
 */
export function parseNotifyWebhookJson(json: unknown): ParsedNotifyWebhookResult {
  const legacy = WebhookBodySchema.safeParse(json);
  if (legacy.success) {
    return { ok: true, webhook: legacy.data };
  }
  const env = RelayNotifyEnvelopeSchema.safeParse(json);
  if (!env.success) {
    return { ok: false, issues: env.error.issues };
  }
  const mapped = mapRelayEnvelopeToWebhookBody(env.data);
  if (mapped === 'noop') {
    return { ok: true, noop: true };
  }
  return { ok: true, webhook: mapped };
}

// ---------------------------------------------------------------------------
// Similarity report (PROCESSING_PHASE_COMPLETE payload)
// ---------------------------------------------------------------------------

export const TopMatchSchema = z.object({
  percentage: z.number(),
  submission_id: z.string().optional(),
  source_type: z.string(),
  matched_word_count_total: z.number(),
  submitted_date: z.string().optional(),
  institution_name: z.string().optional(),
  name: z.string(),
});
export type TopMatch = z.infer<typeof TopMatchSchema>;

export const SimilarityReportPayloadSchema = z.object({
  submission_id: z.string(),
  overall_match_percentage: z.number(),
  internet_match_percentage: z.number().nullable().optional(),
  publication_match_percentage: z.number().nullable().optional(),
  submitted_works_match_percentage: z.number().nullable().optional(),
  status: z.enum(['PROCESSING', 'COMPLETE']),
  time_requested: z.string(),
  time_generated: z.string().optional(),
  top_source_largest_matched_word_count: z.number().optional(),
  top_matches: z.array(TopMatchSchema).max(5).optional(),
  metadata: z.object({ custom: z.string().optional() }).passthrough().optional(),
});
export type SimilarityReport = z.infer<typeof SimilarityReportPayloadSchema>;
