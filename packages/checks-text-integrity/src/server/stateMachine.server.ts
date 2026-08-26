import type {
  TextIntegrityStages,
  TextIntegrityDataSchema,
  LinearStageStatus,
  LinearStage,
  WebhookBody,
  StoredSimilarityReport,
} from '../schema.js';

import {
  WebhookEvent,
  WEBHOOK_EVENTS,
  SimilarityReportPayloadSchema,
  MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
  toStoredSimilarityReport,
} from '../schema.js';

const HISTORY_LIMIT = 20;
const WEBHOOK_HISTORY_LIMIT = 50;
const SIMILARITY_UPDATED_PROVIDER_EVENT = 'SIMILARITY_UPDATED';

// ---------------------------------------------------------------------------
// Stage helpers (mirror proofig's setLinearStage)
// ---------------------------------------------------------------------------

function setLinearStage(
  stages: TextIntegrityStages,
  key: keyof TextIntegrityStages,
  status: LinearStageStatus,
  receivedAt: string,
  error?: string,
  errorCode?: string,
): TextIntegrityStages {
  const prev = stages[key] as LinearStage | undefined;
  const prevStatus = prev?.status;
  const prevTimestamp = prev?.timestamp;
  const historyEntry =
    prevStatus != null && prevTimestamp != null
      ? { status: prevStatus, timestamp: prevTimestamp }
      : null;
  const history = [...(historyEntry ? [historyEntry] : []), ...(prev?.history ?? [])].slice(
    0,
    HISTORY_LIMIT,
  );

  return {
    ...stages,
    [key]: {
      ...(stages[key] as any),
      status,
      timestamp: receivedAt,
      history,
      ...(error ? { error } : {}),
      ...(errorCode ? { errorCode } : {}),
    },
  } as TextIntegrityStages;
}

function isSimilarityUpdatedWebhook(webhook: WebhookBody): boolean {
  return webhook.metadata?.provider_event === SIMILARITY_UPDATED_PROVIDER_EVENT;
}

function getPayloadErrorCode(payload: WebhookBody['payload']): string | undefined {
  const code = payload?.error_code;
  return typeof code === 'string' && code.trim() !== '' ? code.trim() : undefined;
}

function getPayloadErrorMessage(payload: WebhookBody['payload'], fallback: string): string {
  const message = payload?.error_message;
  if (typeof message === 'string' && message.trim() !== '') return message.trim();
  return getPayloadErrorCode(payload) ?? fallback;
}

// ---------------------------------------------------------------------------
// Lifecycle helpers (called from the submit job, not from webhooks)
// ---------------------------------------------------------------------------

/**
 * Mark the submission stage as processing (called when the submit job starts).
 */
export function startSubmission(
  current?: TextIntegrityDataSchema,
  receivedAt: string = new Date().toISOString(),
): TextIntegrityDataSchema {
  const base = current ?? MINIMAL_TEXT_INTEGRITY_SERVICE_DATA;
  const stages = base.stages ?? MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages;
  const updatedStages = setLinearStage(stages, 'submission', 'processing', receivedAt);
  return {
    ...base,
    stages: updatedStages,
  };
}

/**
 * Mark the submission as errored (called when the submit job fails).
 */
export function markSubmissionError(
  current?: TextIntegrityDataSchema,
  message?: string,
  receivedAt: string = new Date().toISOString(),
): TextIntegrityDataSchema {
  const base = current ?? MINIMAL_TEXT_INTEGRITY_SERVICE_DATA;
  const stages = base.stages ?? MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages;
  const updatedStages = setLinearStage(stages, 'submission', 'error', receivedAt, message);
  return {
    ...base,
    stages: updatedStages,
  };
}

// ---------------------------------------------------------------------------
// Main state machine transition
// ---------------------------------------------------------------------------

/**
 * Pure transition function for mapping provider webhook events onto `serviceData`.
 * Returns the next state, or `null` if the event is a no-op (duplicate/already in that state).
 */
export function applyWebhookEvent(
  current: TextIntegrityDataSchema,
  webhook: WebhookBody,
  receivedAt: string = new Date().toISOString(),
): TextIntegrityDataSchema | null {
  if (!WEBHOOK_EVENTS.includes(webhook.event)) {
    console.warn(`[checks-text-integrity] Unknown webhook event: ${webhook.event}, ignoring.`);
    return current;
  }

  const stages = current.stages ?? MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages;
  let updatedStages: TextIntegrityStages | null = null;
  let summaryReport: StoredSimilarityReport | undefined = current.summaryReport;
  let reportPdfId: string | undefined = current.reportPdfId;
  let reportPdfUrl: string | undefined = current.reportPdfUrl;
  let similarityReportPdfInvalidated = current.similarityReportPdfInvalidated;
  let similarityReportPdfInvalidatedAt = current.similarityReportPdfInvalidatedAt;
  let similarityReportPdfInvalidatedByEvent = current.similarityReportPdfInvalidatedByEvent;
  let errorMessage: string | undefined;

  function hasSimilarityPdfToInvalidate() {
    return Boolean(
      current.similarityReportStored ||
      current.reportPdfId ||
      current.latest?.reportPdfId ||
      current.storedReportPdfId,
    );
  }

  function invalidateSimilarityPdf() {
    if (!hasSimilarityPdfToInvalidate()) return;
    similarityReportPdfInvalidated = true;
    similarityReportPdfInvalidatedAt = receivedAt;
    similarityReportPdfInvalidatedByEvent = SIMILARITY_UPDATED_PROVIDER_EVENT;
  }

  function clearSimilarityPdfInvalidation() {
    similarityReportPdfInvalidated = undefined;
    similarityReportPdfInvalidatedAt = undefined;
    similarityReportPdfInvalidatedByEvent = undefined;
  }
  let errorCode: string | undefined;

  function mergeReportPayload(reportObj: unknown) {
    if (!reportObj || typeof reportObj !== 'object') return;
    const r = reportObj as Record<string, unknown>;
    if (typeof r.report_id === 'string') reportPdfId = String(r.report_id);
    if (typeof r.report_pdf_url === 'string') reportPdfUrl = String(r.report_pdf_url);
  }

  switch (webhook.event) {
    case WebhookEvent.SubmissionComplete: {
      if (stages.submission.status === 'completed') break;
      let s = setLinearStage(stages, 'submission', 'completed', receivedAt);
      s = setLinearStage(s, 'processing', 'pending', receivedAt);
      updatedStages = s;
      break;
    }

    case WebhookEvent.SubmissionFailed: {
      if (stages.submission.status === 'error') break;
      errorCode = getPayloadErrorCode(webhook.payload);
      errorMessage = getPayloadErrorMessage(webhook.payload, 'Submission failed');
      updatedStages = setLinearStage(
        stages,
        'submission',
        'error',
        receivedAt,
        errorMessage,
        errorCode,
      );
      break;
    }

    case WebhookEvent.ProcessingPhaseStarted: {
      if (isSimilarityUpdatedWebhook(webhook)) {
        const rawSimilarity =
          webhook.payload?.similarity_report ?? webhook.payload?.provider_payload;
        const reportResult = SimilarityReportPayloadSchema.safeParse(rawSimilarity);
        if (reportResult.success) {
          summaryReport = toStoredSimilarityReport(reportResult.data);
        }
        invalidateSimilarityPdf();
        if (
          stages.processing?.status === 'completed' ||
          stages.processing?.status === 'notify-skipped'
        ) {
          updatedStages = stages;
          break;
        }
        if (stages.processing?.status === 'processing') {
          updatedStages = stages;
          break;
        }
      }
      if (stages.processing?.status === 'processing') break;
      let s = stages;
      if (s.submission.status !== 'completed' && s.submission.status !== 'notify-skipped') {
        s = setLinearStage(s, 'submission', 'notify-skipped', receivedAt);
      }
      updatedStages = setLinearStage(s, 'processing', 'processing', receivedAt);
      break;
    }

    case WebhookEvent.ProcessingPhaseComplete: {
      const rawSimilarity = webhook.payload?.similarity_report ?? webhook.payload?.provider_payload;
      const reportResult = SimilarityReportPayloadSchema.safeParse(rawSimilarity);

      if (
        stages.processing?.status === 'completed' ||
        stages.processing?.status === 'notify-skipped'
      ) {
        if (!reportResult.success) break;
        summaryReport = toStoredSimilarityReport(reportResult.data);
        if (isSimilarityUpdatedWebhook(webhook)) {
          invalidateSimilarityPdf();
        }
        updatedStages = stages;
        break;
      }

      let s = stages;
      if (s.submission.status !== 'completed' && s.submission.status !== 'notify-skipped') {
        s = setLinearStage(s, 'submission', 'notify-skipped', receivedAt);
      }
      s = setLinearStage(s, 'processing', 'completed', receivedAt);
      s = setLinearStage(s, 'reportGeneration', 'pending', receivedAt);
      updatedStages = s;

      if (reportResult.success) {
        summaryReport = toStoredSimilarityReport(reportResult.data);
      }
      if (isSimilarityUpdatedWebhook(webhook)) {
        invalidateSimilarityPdf();
      }

      mergeReportPayload(webhook.payload?.report);
      break;
    }

    case WebhookEvent.ProcessingPhaseFailed: {
      if (stages.processing?.status === 'error') break;
      errorCode = getPayloadErrorCode(webhook.payload);
      errorMessage = getPayloadErrorMessage(webhook.payload, 'Processing phase failed');
      let s = stages;
      if (s.submission.status !== 'completed' && s.submission.status !== 'notify-skipped') {
        s = setLinearStage(s, 'submission', 'notify-skipped', receivedAt);
      }
      updatedStages = setLinearStage(s, 'processing', 'error', receivedAt, errorMessage, errorCode);
      break;
    }

    case WebhookEvent.ReportGenerationStarted: {
      mergeReportPayload(webhook.payload?.report);

      if (stages.reportGeneration?.status === 'processing') {
        const nextId = reportPdfId ?? current.reportPdfId;
        const nextUrl = reportPdfUrl ?? current.reportPdfUrl;
        if (nextId === current.reportPdfId && nextUrl === current.reportPdfUrl) {
          break;
        }
        updatedStages = stages;
        break;
      }

      let s = stages;
      if (s.submission.status !== 'completed' && s.submission.status !== 'notify-skipped') {
        s = setLinearStage(s, 'submission', 'notify-skipped', receivedAt);
      }
      if (s.processing?.status !== 'completed' && s.processing?.status !== 'notify-skipped') {
        s = setLinearStage(s, 'processing', 'notify-skipped', receivedAt);
      }
      updatedStages = setLinearStage(s, 'reportGeneration', 'processing', receivedAt);
      break;
    }

    case WebhookEvent.ReportGenerationComplete: {
      mergeReportPayload(webhook.payload?.report);

      if (
        stages.reportGeneration?.status === 'completed' ||
        stages.reportGeneration?.status === 'notify-skipped'
      ) {
        const nextId = reportPdfId ?? current.reportPdfId;
        const nextUrl = reportPdfUrl ?? current.reportPdfUrl;
        if (nextId === current.reportPdfId && nextUrl === current.reportPdfUrl) {
          break;
        }
        clearSimilarityPdfInvalidation();
        updatedStages = stages;
        break;
      }

      let s = stages;
      if (s.submission.status !== 'completed' && s.submission.status !== 'notify-skipped') {
        s = setLinearStage(s, 'submission', 'notify-skipped', receivedAt);
      }
      if (s.processing?.status !== 'completed' && s.processing?.status !== 'notify-skipped') {
        s = setLinearStage(s, 'processing', 'notify-skipped', receivedAt);
      }
      updatedStages = setLinearStage(s, 'reportGeneration', 'completed', receivedAt);
      clearSimilarityPdfInvalidation();

      break;
    }

    case WebhookEvent.ReportGenerationFailed: {
      if (stages.reportGeneration?.status === 'error') break;
      errorCode = getPayloadErrorCode(webhook.payload);
      errorMessage = getPayloadErrorMessage(webhook.payload, 'Report generation failed');
      let s = stages;
      if (s.submission.status !== 'completed' && s.submission.status !== 'notify-skipped') {
        s = setLinearStage(s, 'submission', 'notify-skipped', receivedAt);
      }
      if (s.processing?.status !== 'completed' && s.processing?.status !== 'notify-skipped') {
        s = setLinearStage(s, 'processing', 'notify-skipped', receivedAt);
      }
      updatedStages = setLinearStage(
        s,
        'reportGeneration',
        'error',
        receivedAt,
        errorMessage,
        errorCode,
      );
      break;
    }
  }

  if (!updatedStages) return null;

  const webhookLogEntry = {
    event: webhook.event,
    receivedAt,
    payload: webhook.payload as Record<string, unknown> | undefined,
  };
  const webhookHistory = [webhookLogEntry, ...(current.webhookHistory ?? [])].slice(
    0,
    WEBHOOK_HISTORY_LIMIT,
  );

  const next: TextIntegrityDataSchema = {
    ...current,
    stages: updatedStages,
    summaryReport,
    reportPdfId: reportPdfId ?? current.reportPdfId,
    reportPdfUrl: reportPdfUrl ?? current.reportPdfUrl,
    similarityReportPdfInvalidated,
    similarityReportPdfInvalidatedAt,
    similarityReportPdfInvalidatedByEvent,
    latest: {
      event: webhook.event,
      receivedAt,
      overallMatchPercentage:
        summaryReport?.overallMatchPercentage ?? current.latest?.overallMatchPercentage,
      reportPdfId: reportPdfId ?? current.latest?.reportPdfId,
      reportPdfUrl: reportPdfUrl ?? current.latest?.reportPdfUrl,
      errorMessage: errorMessage ?? current.latest?.errorMessage,
      errorCode: errorCode ?? current.latest?.errorCode,
    },
    webhookHistory,
  };

  return next;
}

/** Mark that checks-relay has been asked to start similarity PDF generation. */
export function markSimilarityPdfJobStartRequested(
  current: TextIntegrityDataSchema,
  receivedAt: string = new Date().toISOString(),
): TextIntegrityDataSchema {
  const base = current;
  const stages = base.stages ?? MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages;
  const updatedStages = setLinearStage(stages, 'reportGeneration', 'processing', receivedAt);
  return {
    ...base,
    stages: updatedStages,
    reportPdfUrl: undefined,
    similarityReportStored: false,
    latest: base.latest
      ? {
          ...base.latest,
          reportPdfUrl: undefined,
        }
      : undefined,
  };
}

/**
 * After a successful POST to checks-relay to start similarity PDF generation.
 * Stores the new `reportPdfId` only; clears `reportPdfUrl` until a notify webhook
 * provides `payload.report.report_pdf_url` (see mergeReportPayload).
 */
export function markSimilarityPdfJobRestarted(
  current: TextIntegrityDataSchema,
  newPdfId: string,
  receivedAt: string = new Date().toISOString(),
): TextIntegrityDataSchema {
  const base = current;
  const stages = base.stages ?? MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages;
  const updatedStages = setLinearStage(stages, 'reportGeneration', 'processing', receivedAt);
  return {
    ...base,
    stages: updatedStages,
    reportPdfId: newPdfId,
    reportPdfUrl: undefined,
    similarityReportStored: false,
    latest: base.latest
      ? {
          ...base.latest,
          reportPdfId: newPdfId,
          reportPdfUrl: undefined,
        }
      : undefined,
  };
}

/** Mark a failed attempt to ask checks-relay to start PDF generation. */
export function markSimilarityPdfJobStartFailed(
  current: TextIntegrityDataSchema,
  message: string,
  receivedAt: string = new Date().toISOString(),
): TextIntegrityDataSchema {
  const base = current;
  const stages = base.stages ?? MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages;
  const updatedStages = setLinearStage(stages, 'reportGeneration', 'error', receivedAt, message);
  return {
    ...base,
    stages: updatedStages,
  };
}
