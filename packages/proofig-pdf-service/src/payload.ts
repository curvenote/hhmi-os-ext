import { z } from 'zod';

/**
 * Business payload for the proofig-pdf-service, delivered as base64 JSON in the
 * Pub/Sub push `message.data`. The publisher (checks-proofig extension) builds a
 * fully-formed `reportUrl` (Proofig report link with a fresh access token) so the
 * container only has to open it and print to PDF.
 */
export const ProofigPdfPayloadSchema = z.object({
  /** Fully formed Proofig report URL including a valid access token. */
  reportUrl: z.string().url('reportUrl must be a valid URL'),
  /** Work version the report belongs to (for storage bucket + registration). */
  work_version_id: z.string().min(1, 'work_version_id is required'),
  /** Proofig check service run id (used in the storage path + registration hook). */
  check_service_run_id: z.string().min(1, 'check_service_run_id is required'),
  /** CDN identifier for the work version (selects the storage bucket). */
  cdn: z.string().min(1, 'cdn is required'),
  /** CDN key prefix for the work version (root of the storage path). */
  cdn_key: z.string().min(1, 'cdn_key is required'),
  /** Optional Proofig report id, echoed back on registration for idempotency. */
  report_id: z.string().optional(),
  /** When true, regenerate even if a PDF was already stored for this report. */
  force: z.boolean().optional(),
});

export type ProofigPdfPayload = z.infer<typeof ProofigPdfPayloadSchema>;

/** Minimal body for POST /test-render (render-only local smoke tests). */
export const RenderOnlyRequestSchema = z.object({
  reportUrl: z.string().url('reportUrl must be a valid URL'),
});

export type RenderOnlyRequest = z.infer<typeof RenderOnlyRequestSchema>;

export function validateRenderOnlyRequest(input: unknown): RenderOnlyRequest {
  const result = RenderOnlyRequestSchema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid render-only request: ${message}`);
  }
  return result.data;
}

export function validateProofigPdfPayload(input: unknown): ProofigPdfPayload {
  const result = ProofigPdfPayloadSchema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid proofig-pdf payload: ${message}`);
  }
  return result.data;
}

export const PROOFIG_REPORT_FILENAME = 'proofig-report.pdf';

/**
 * Storage path for the persisted Proofig report PDF, relative to the work version
 * `cdn_key` (the value expected by `uploadSingleFileToCdn`, which prefixes `cdnKey`).
 * The resulting absolute object key is `{cdn_key}/generated/{checkRunId}/proofig-report.pdf`,
 * mirroring the text-integrity similarity report layout.
 */
export function proofigReportStoragePath(checkRunId: string): string {
  return `generated/${checkRunId}/${PROOFIG_REPORT_FILENAME}`;
}
