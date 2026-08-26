import type { FileMetadataSectionItem } from '@curvenote/scms-core';
import { KnownState, type ProofigDataSchema } from './schema.js';

export const PROOFIG_REPORT_GENERATED_SLOT = 'generated';
export const PROOFIG_REPORT_FILENAME = 'proofig-report.pdf';

/** UI / enqueue readiness for the persisted Proofig report PDF. */
export type ProofigPdfReadiness =
  | 'not-final'
  | 'no-url'
  | 'pending'
  | 'failed'
  | 'stored-current'
  | 'stored-stale';

/** State of the latest PDF generation attempt, independent of artifact availability. */
export type ProofigPdfAttemptState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'failed'; error: string };

/** Strip query strings and truncate noisy worker/job error text for UI display. */
export function summarizeProofigPdfError(message: string): string {
  const withoutQuery = message.replace(/\?[^?\s]*/g, '');
  const firstLine = withoutQuery.split('\n')[0]?.trim() || withoutQuery.trim();
  if (firstLine.length <= 280) return firstLine;
  return `${firstLine.slice(0, 277)}…`;
}

/** Record a persist/render failure on check-run serviceData for the PDF actions UI. */
export function markProofigReportPdfError(
  serviceData: ProofigDataSchema,
  message: string,
  failedAt = new Date().toISOString(),
  failedReportId?: string,
): ProofigDataSchema {
  return {
    ...serviceData,
    proofigReportPdfError: summarizeProofigPdfError(message),
    proofigReportPdfFailedAt: failedAt,
    proofigReportPdfFailedReportId: failedReportId,
    proofigReportPdfRequestedAt: undefined,
  };
}

/** Clear PDF persist failure flags (e.g. before retry enqueue or after successful store). */
export function clearProofigReportPdfError(serviceData: ProofigDataSchema): ProofigDataSchema {
  if (
    serviceData.proofigReportPdfError == null &&
    serviceData.proofigReportPdfFailedAt == null &&
    serviceData.proofigReportPdfFailedReportId == null
  ) {
    return serviceData;
  }
  return {
    ...serviceData,
    proofigReportPdfError: undefined,
    proofigReportPdfFailedAt: undefined,
    proofigReportPdfFailedReportId: undefined,
  };
}

/**
 * After this age, treat `proofigReportPdfRequestedAt` as stale so the UI leaves perpetual
 * “Generating…” when a job never terminates (stuck RUNNING, lost Pub/Sub, etc.).
 */
export const PROOFIG_PDF_GENERATING_STALE_MS = 15 * 60 * 1000;

/** Parse a persisted PDF request stamp, returning null when it is absent or invalid. */
export function parseProofigPdfRequestStamp(stamp: string | null | undefined): number | null {
  const trimmed = stamp?.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Mark that a PROOFIG_PERSIST_PDF job was enqueued (UI “Generating…” signal). */
export function markProofigReportPdfRequested(
  serviceData: ProofigDataSchema,
  requestedAt = new Date().toISOString(),
): ProofigDataSchema {
  return {
    ...serviceData,
    proofigReportPdfRequestedAt: requestedAt,
  };
}

/**
 * True when a PDF persist was requested recently enough that the UI should show
 * “Generating…” (and keep Download hidden while a re-render is in flight).
 */
export function isProofigPdfGenerationInFlight(
  serviceData: ProofigDataSchema | undefined,
  nowMs = Date.now(),
): boolean {
  const requestedAtMs = parseProofigPdfRequestStamp(serviceData?.proofigReportPdfRequestedAt);
  if (requestedAtMs == null) return false;
  return nowMs - requestedAtMs < PROOFIG_PDF_GENERATING_STALE_MS;
}

/**
 * True when the recorded failure applies to the current report.
 *
 * Legacy errors have no failed report id. Treat them as current conservatively so existing
 * permanent failures do not enter an automatic retry loop after deployment.
 */
export function isProofigPdfFailureForCurrentReport(
  serviceData: ProofigDataSchema | undefined,
): boolean {
  const error = serviceData?.proofigReportPdfError?.trim();
  if (!error) return false;
  const failedReportId = serviceData?.proofigReportPdfFailedReportId?.trim();
  const currentReportId = currentProofigReportId(serviceData);
  return !failedReportId || !currentReportId || failedReportId === currentReportId;
}

/**
 * Derive generation-attempt UI state independently from stored artifact readiness.
 * A null clock means SSR / initial hydration: conservatively treat a valid request stamp as
 * generating until the client effect supplies a clock and can prove that the stamp is stale.
 */
export function getProofigPdfAttemptState(
  serviceData: ProofigDataSchema | undefined,
  nowMs: number | null = Date.now(),
): ProofigPdfAttemptState {
  const requestedAtMs = parseProofigPdfRequestStamp(serviceData?.proofigReportPdfRequestedAt);
  if (
    requestedAtMs != null &&
    (nowMs == null || isProofigPdfGenerationInFlight(serviceData, nowMs))
  ) {
    return { status: 'generating' };
  }
  if (isProofigPdfFailureForCurrentReport(serviceData)) {
    return { status: 'failed', error: serviceData!.proofigReportPdfError!.trim() };
  }
  return { status: 'idle' };
}

/** Clear the enqueue stamp once generation has terminated (stored or failed). */
export function clearProofigReportPdfRequested(serviceData: ProofigDataSchema): ProofigDataSchema {
  if (serviceData.proofigReportPdfRequestedAt == null) return serviceData;
  return {
    ...serviceData,
    proofigReportPdfRequestedAt: undefined,
  };
}

/**
 * Absolute storage object key for the persisted Proofig report PDF for a check run
 * (`{cdn_key}/generated/{checkRunId}/proofig-report.pdf`).
 *
 * Contract: the Cloud Run worker passes a *relative* path to `uploadSingleFileToCdn`,
 * which returns this absolute key; the pdf-stored hook and download loader both expect
 * that absolute form (see scms-tasks `uploadSingleFileToCdn` return value).
 */
export function proofigReportStoragePath(cdnKey: string, checkRunId: string): string {
  const prefix = cdnKey.replace(/\/$/, '');
  return `${prefix}/generated/${checkRunId}/${PROOFIG_REPORT_FILENAME}`;
}

/** The report revision key used for idempotency (Proofig report id). */
export function currentProofigReportId(
  serviceData: ProofigDataSchema | undefined,
): string | undefined {
  const id = serviceData?.reportId?.trim();
  return id ? id : undefined;
}

/** File entry (keyed by storage path) for the stored Proofig report PDF, if present. */
export function getStoredProofigReportFile(
  serviceData: ProofigDataSchema | undefined,
): FileMetadataSectionItem | undefined {
  const files = serviceData?.files;
  if (!files || typeof files !== 'object') return undefined;
  for (const entry of Object.values(files)) {
    if (entry?.slot === PROOFIG_REPORT_GENERATED_SLOT) return entry;
  }
  return undefined;
}

/**
 * True when Proofig has reached a final report outcome (Clean or Flagged), either via the
 * resultsReview stage outcome or the summary state. This is the earliest point at which a
 * report PDF can be generated.
 */
export function isProofigAtFinalReportStage(serviceData: ProofigDataSchema | undefined): boolean {
  if (!serviceData || serviceData.deleted) return false;
  const rr = serviceData.stages?.resultsReview;
  if (
    (rr?.status === 'completed' || rr?.status === 'not-requested') &&
    (rr.outcome === 'clean' || rr.outcome === 'flagged')
  ) {
    return true;
  }
  const state = serviceData.summary?.state;
  return state === KnownState.ReportClean || state === KnownState.ReportFlagged;
}

function proofigReportUrl(serviceData: ProofigDataSchema | undefined): string | undefined {
  const url = serviceData?.reportUrl?.trim() || serviceData?.summary?.reportUrl?.trim();
  return url ? url : undefined;
}

/** True when a Proofig report PDF is stored for the current report id. */
export function hasStoredProofigReport(serviceData: ProofigDataSchema | undefined): boolean {
  if (serviceData?.proofigReportStored !== true) return false;
  if (!getStoredProofigReportFile(serviceData)?.path) return false;
  const reportId = currentProofigReportId(serviceData);
  // If we know the current report id, require the stored id to match it.
  if (reportId) return serviceData.storedReportId === reportId;
  return true;
}

/**
 * Single readiness classifier for UI, download, and enqueue decisions.
 *
 * - `not-final` — report stage not reached
 * - `no-url` — final but no report URL to render from
 * - `pending` — final with URL, PDF not yet stored for current report
 * - `failed` — persist/render failed (and nothing current is stored)
 * - `stored-current` — PDF stored for the current report id
 * - `stored-stale` — PDF metadata present but for a different report id
 */
export function getProofigPdfReadiness(
  serviceData: ProofigDataSchema | undefined,
): ProofigPdfReadiness {
  if (!isProofigAtFinalReportStage(serviceData)) return 'not-final';
  if (!proofigReportUrl(serviceData)) return 'no-url';
  if (hasStoredProofigReport(serviceData)) return 'stored-current';

  const reportId = currentProofigReportId(serviceData);
  if (
    serviceData?.proofigReportStored === true &&
    reportId &&
    serviceData.storedReportId !== reportId
  ) {
    return 'stored-stale';
  }
  if (isProofigPdfFailureForCurrentReport(serviceData)) return 'failed';
  return 'pending';
}

/** Drop all generated-slot file entries; returns undefined when the map is empty. */
export function withoutGeneratedProofigReportFiles(
  files: ProofigDataSchema['files'],
): ProofigDataSchema['files'] {
  if (!files || typeof files !== 'object') return undefined;
  const nextFiles = { ...files };
  for (const key of Object.keys(nextFiles)) {
    if (nextFiles[key]?.slot === PROOFIG_REPORT_GENERATED_SLOT) {
      delete nextFiles[key];
    }
  }
  return Object.keys(nextFiles).length > 0 ? nextFiles : undefined;
}

/**
 * Replace any prior generated-slot PDF entry and mark the report as stored.
 * When `storedReportId` is omitted, falls back to `serviceData.reportId` (same as the
 * pdf-stored hook).
 */
export function replaceGeneratedProofigReport(
  serviceData: ProofigDataSchema,
  fileEntry: FileMetadataSectionItem,
  storedReportId: string | undefined,
): ProofigDataSchema {
  const nextFiles = { ...(withoutGeneratedProofigReportFiles(serviceData.files) ?? {}) };
  nextFiles[fileEntry.path] = fileEntry;
  return clearProofigReportPdfRequested(
    clearProofigReportPdfError({
      ...serviceData,
      files: nextFiles,
      proofigReportStored: true,
      storedReportId: storedReportId ?? serviceData.reportId,
    }),
  );
}

/**
 * Clear generated-slot file metadata and stored-report flags so `shouldPersistProofigReport`
 * can enqueue again (e.g. after the CDN object was deleted but metadata remained).
 */
export function clearStoredProofigReport(serviceData: ProofigDataSchema): ProofigDataSchema {
  return clearProofigReportPdfError({
    ...serviceData,
    files: withoutGeneratedProofigReportFiles(serviceData.files),
    proofigReportStored: false,
    storedReportId: undefined,
  });
}

/**
 * True when we should (auto) persist a report PDF: at a final report stage, with a report URL,
 * and either nothing stored yet or the stored PDF is for a different report id.
 *
 * Kept independent of `getProofigPdfReadiness` so a stored flag with a matching report id
 * (even without a file entry) still skips auto-persist — matching prior enqueue behavior.
 */
export function shouldPersistProofigReport(serviceData: ProofigDataSchema | undefined): boolean {
  if (!serviceData) return false;
  if (!isProofigAtFinalReportStage(serviceData)) return false;
  if (!proofigReportUrl(serviceData)) return false;
  if (!serviceData.proofigReportStored) return true;
  const reportId = currentProofigReportId(serviceData);
  return Boolean(reportId && serviceData.storedReportId !== reportId);
}

/** Build the file metadata entry stored on check run `serviceData.files`. */
export function buildProofigReportFileEntry(
  storagePath: string,
  size: number,
  md5: string,
  uploadDate: string,
): FileMetadataSectionItem {
  return {
    name: PROOFIG_REPORT_FILENAME,
    path: storagePath,
    size,
    type: 'application/pdf',
    md5,
    slot: PROOFIG_REPORT_GENERATED_SLOT,
    uploadDate,
    label: 'Proofig report',
  };
}
