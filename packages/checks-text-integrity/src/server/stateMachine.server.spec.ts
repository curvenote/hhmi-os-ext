// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import {
  applyWebhookEvent,
  markSimilarityPdfJobRestarted,
  markSimilarityPdfJobStartFailed,
  markSimilarityPdfJobStartRequested,
  markSubmissionError,
  startSubmission,
} from './stateMachine.server.js';
import {
  type TextIntegrityDataSchema,
  type WebhookBody,
  WebhookEvent,
  getCurrentTextIntegrityState,
  getTextIntegrityError,
  hasError,
  parseNotifyWebhookJson,
} from '../schema.js';

function makeWebhook(event: WebhookEvent, extra?: Partial<WebhookBody['payload']>): WebhookBody {
  return { event, payload: extra };
}

const SAMPLE_SIMILARITY_REPORT = {
  submission_id: 'sub-123',
  overall_match_percentage: 12,
  internet_match_percentage: 5,
  publication_match_percentage: 3,
  submitted_works_match_percentage: 4,
  status: 'COMPLETE' as const,
  time_requested: '2025-01-01T00:00:00Z',
  time_generated: '2025-01-01T00:01:00Z',
  top_source_largest_matched_word_count: 100,
  top_matches: [
    {
      percentage: 8,
      submission_id: 'match-1',
      source_type: 'INTERNET',
      matched_word_count_total: 80,
      name: 'example.com',
    },
  ],
};

function processingCompleteWebhook(): WebhookBody {
  return makeWebhook(WebhookEvent.ProcessingPhaseComplete, {
    provider_payload: SAMPLE_SIMILARITY_REPORT,
    report: { report_id: 'pdf-001' },
  });
}

function similarityUpdatedWebhook(
  event: WebhookEvent.ProcessingPhaseStarted | WebhookEvent.ProcessingPhaseComplete,
  status: 'PROCESSING' | 'COMPLETE',
  overallMatchPercentage = 7,
): WebhookBody {
  return {
    event,
    metadata: { provider_event: 'SIMILARITY_UPDATED' },
    payload: {
      similarity_report: {
        ...SAMPLE_SIMILARITY_REPORT,
        status,
        overall_match_percentage: overallMatchPercentage,
      },
    },
  };
}

function reportCompleteWebhook(): WebhookBody {
  return makeWebhook(WebhookEvent.ReportGenerationComplete, {
    report: {
      report_id: 'pdf-002',
      report_pdf_url: 'https://api.example.com/api/v1/submissions/sub-1/similarity/pdf/pdf-002',
    },
  });
}

describe('Text Integrity State Machine', () => {
  describe('Lifecycle helpers', () => {
    it('startSubmission initializes stages with submission processing', () => {
      const result = startSubmission();
      expect(result.stages.submission.status).toBe('processing');
      expect(getCurrentTextIntegrityState(result)).toBe('submitting');
    });

    it('startSubmission updates existing data', () => {
      const existing: TextIntegrityDataSchema = {
        submissionId: 'sub-1',
        stages: {
          submission: { status: 'pending', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const result = startSubmission(existing, '2025-01-01T00:01:00Z');
      expect(result.submissionId).toBe('sub-1');
      expect(result.stages.submission.status).toBe('processing');
      expect(result.stages.submission.history).toHaveLength(1);
      expect(result.stages.submission.history[0].status).toBe('pending');
    });

    it('markSimilarityPdfJobStartRequested marks report generation processing without clearing stale invalidation', () => {
      const result = markSimilarityPdfJobStartRequested(
        {
          stages: {
            submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
            processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
            reportGeneration: {
              status: 'completed',
              history: [],
              timestamp: '2025-01-01T00:00:00Z',
            },
          },
          reportPdfId: 'pdf-old',
          reportPdfUrl: 'https://relay.example.com/pdf-old',
          similarityReportStored: true,
          storedReportPdfId: 'pdf-old',
          similarityReportPdfInvalidated: true,
        },
        '2025-01-01T00:01:00Z',
      );

      expect(result.stages.reportGeneration?.status).toBe('processing');
      expect(result.reportPdfId).toBe('pdf-old');
      expect(result.reportPdfUrl).toBeUndefined();
      expect(result.similarityReportStored).toBe(false);
      expect(result.similarityReportPdfInvalidated).toBe(true);
    });

    it('markSimilarityPdfJobRestarted stores the new PDF id but leaves completion to webhooks', () => {
      const result = markSimilarityPdfJobRestarted(
        {
          stages: {
            submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
            processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
            reportGeneration: {
              status: 'processing',
              history: [],
              timestamp: '2025-01-01T00:00:00Z',
            },
          },
          reportPdfId: 'pdf-old',
          similarityReportPdfInvalidated: true,
        },
        'pdf-new',
        '2025-01-01T00:01:00Z',
      );

      expect(result.stages.reportGeneration?.status).toBe('processing');
      expect(result.reportPdfId).toBe('pdf-new');
      expect(result.reportPdfUrl).toBeUndefined();
      expect(result.similarityReportStored).toBe(false);
      expect(result.similarityReportPdfInvalidated).toBe(true);
    });

    it('markSimilarityPdfJobStartFailed records an error for the existing retry UI', () => {
      const result = markSimilarityPdfJobStartFailed(
        {
          stages: {
            submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
            processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
            reportGeneration: {
              status: 'processing',
              history: [],
              timestamp: '2025-01-01T00:00:00Z',
            },
          },
          similarityReportPdfInvalidated: true,
        },
        'Failed to start PDF regeneration: relay unavailable',
        '2025-01-01T00:01:00Z',
      );

      expect(result.stages.reportGeneration?.status).toBe('error');
      expect(result.stages.reportGeneration?.error).toContain('relay unavailable');
      expect(result.similarityReportPdfInvalidated).toBe(true);
    });

    it('markSubmissionError sets error stage', () => {
      const result = markSubmissionError(undefined, 'Network timeout');
      expect(result.stages.submission.status).toBe('error');
      expect(result.stages.submission.error).toBe('Network timeout');
      expect(getCurrentTextIntegrityState(result)).toBe('error');
      expect(getTextIntegrityError(result)).toBe('Network timeout');
    });
  });

  describe('Edge Cases', () => {
    it('initializes stages if current data has no stages', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'pending', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, makeWebhook(WebhookEvent.SubmissionComplete));
      expect(next).not.toBeNull();
      expect(next?.stages.submission.status).toBe('completed');
      expect(next?.stages.processing?.status).toBe('pending');
    });

    it('ignores unknown webhook events gracefully', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, { event: 'UNKNOWN_EVENT' as any });
      expect(next).toEqual(initial);
    });
  });

  describe('Service Data Updates', () => {
    it('stores similarity report from PROCESSING_PHASE_COMPLETE', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const receivedAt = '2025-01-01T00:02:00Z';
      const next = applyWebhookEvent(initial, processingCompleteWebhook(), receivedAt);

      expect(next).not.toBeNull();
      expect(next?.summaryReport).toBeDefined();
      expect(next?.summaryReport?.overallMatchPercentage).toBe(12);
      expect(next?.summaryReport?.topMatches).toHaveLength(1);
      expect(next?.reportPdfId).toBe('pdf-001');
    });

    it('stores reportPdfId from REPORT_GENERATION_COMPLETE', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'processing',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(initial, reportCompleteWebhook());

      expect(next).not.toBeNull();
      expect(next?.reportPdfId).toBe('pdf-002');
      expect(next?.reportPdfUrl).toBe(
        'https://api.example.com/api/v1/submissions/sub-1/similarity/pdf/pdf-002',
      );
    });

    it('stores report_pdf_url from REPORT_GENERATION_STARTED when already processing', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'processing',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
        reportPdfId: 'pdf-x',
      };
      const url = 'https://api.example.com/api/v1/submissions/s1/similarity/pdf/pdf-x';
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.ReportGenerationStarted, {
          status: 'PROCESSING',
          report: { report_id: 'pdf-x', report_pdf_url: url },
        }),
      );
      expect(next).not.toBeNull();
      expect(next?.reportPdfUrl).toBe(url);
    });

    it('latest is updated from webhook event', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const receivedAt = '2025-01-01T00:02:00Z';
      const next = applyWebhookEvent(initial, processingCompleteWebhook(), receivedAt);

      expect(next?.latest?.event).toBe(WebhookEvent.ProcessingPhaseComplete);
      expect(next?.latest?.receivedAt).toBe(receivedAt);
      expect(next?.latest?.overallMatchPercentage).toBe(12);
      expect(next?.latest?.reportPdfId).toBe('pdf-001');
    });

    it('webhookHistory accumulates events', () => {
      let current: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      current = applyWebhookEvent(
        current,
        makeWebhook(WebhookEvent.SubmissionComplete),
        '2025-01-01T00:01:00Z',
      )!;
      expect(current.webhookHistory).toHaveLength(1);

      current = applyWebhookEvent(
        current,
        makeWebhook(WebhookEvent.ProcessingPhaseStarted),
        '2025-01-01T00:02:00Z',
      )!;
      expect(current.webhookHistory).toHaveLength(2);
      expect(current.webhookHistory![0].event).toBe(WebhookEvent.ProcessingPhaseStarted);
      expect(current.webhookHistory![1].event).toBe(WebhookEvent.SubmissionComplete);
    });

    it('history logging for linear stages', () => {
      const t0 = '2025-01-01T00:00:00Z';
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: t0 },
          processing: { status: 'pending', history: [], timestamp: t0 },
        },
      };

      const t1 = '2025-01-01T00:01:00Z';
      const next = applyWebhookEvent(initial, makeWebhook(WebhookEvent.ProcessingPhaseStarted), t1);

      expect(next?.stages.processing?.status).toBe('processing');
      expect(next?.stages.processing?.timestamp).toBe(t1);
      expect(next?.stages.processing?.history).toHaveLength(1);
      expect(next?.stages.processing?.history[0].status).toBe('pending');
      expect(next?.stages.processing?.history[0].timestamp).toBe(t0);

      const t2 = '2025-01-01T00:02:00Z';
      const next2 = applyWebhookEvent(next!, processingCompleteWebhook(), t2);

      expect(next2?.stages.processing?.status).toBe('completed');
      expect(next2?.stages.processing?.history).toHaveLength(2);
      expect(next2?.stages.processing?.history[0].status).toBe('processing');
      expect(next2?.stages.processing?.history[0].timestamp).toBe(t1);
      expect(next2?.stages.processing?.history[1].status).toBe('pending');
      expect(next2?.stages.processing?.history[1].timestamp).toBe(t0);
    });
  });

  describe('getCurrentTextIntegrityState derives correctly from stages', () => {
    it('maps stages to UI states through the full workflow', () => {
      let current: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      expect(getCurrentTextIntegrityState(current)).toBe('submitting');

      current = applyWebhookEvent(current, makeWebhook(WebhookEvent.SubmissionComplete))!;
      expect(getCurrentTextIntegrityState(current)).toBe('submission_complete');

      current = applyWebhookEvent(current, makeWebhook(WebhookEvent.ProcessingPhaseStarted))!;
      expect(getCurrentTextIntegrityState(current)).toBe('processing_requested');

      current = applyWebhookEvent(current, processingCompleteWebhook())!;
      expect(getCurrentTextIntegrityState(current)).toBe('processing_complete');

      current = applyWebhookEvent(current, makeWebhook(WebhookEvent.ReportGenerationStarted))!;
      expect(getCurrentTextIntegrityState(current)).toBe('report_generation_started');

      current = applyWebhookEvent(current, reportCompleteWebhook())!;
      expect(getCurrentTextIntegrityState(current)).toBe('report_generation_complete');
    });

    it('returns error on SUBMISSION_FAILED', () => {
      const current: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(
        current,
        makeWebhook(WebhookEvent.SubmissionFailed, { error_message: 'Bad document' }),
      )!;
      expect(getCurrentTextIntegrityState(next)).toBe('error');
      expect(getTextIntegrityError(next)).toBe('Bad document');
    });

    it('returns visible submission error and preserves error code from SUBMISSION_FAILED', () => {
      const current: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(
        current,
        makeWebhook(WebhookEvent.SubmissionFailed, {
          error_message: 'The uploaded file type is not supported.',
          error_code: 'UNSUPPORTED_FILETYPE',
        }),
      )!;

      expect(hasError(next)).toBe(true);
      expect(getCurrentTextIntegrityState(next)).toBe('error');
      expect(getTextIntegrityError(next)).toBe('The uploaded file type is not supported.');
      expect(next.stages.submission.status).toBe('error');
      expect(next.stages.submission.error).toBe('The uploaded file type is not supported.');
      expect(next.stages.submission.errorCode).toBe('UNSUPPORTED_FILETYPE');
      expect(next.latest?.errorMessage).toBe('The uploaded file type is not supported.');
      expect(next.latest?.errorCode).toBe('UNSUPPORTED_FILETYPE');
    });

    it('falls back to error_code for visible submission error when message is absent', () => {
      const current: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(
        current,
        makeWebhook(WebhookEvent.SubmissionFailed, {
          error_code: 'TOO_LITTLE_TEXT',
        }),
      )!;

      expect(hasError(next)).toBe(true);
      expect(getTextIntegrityError(next)).toBe('TOO_LITTLE_TEXT');
      expect(next.stages.submission.errorCode).toBe('TOO_LITTLE_TEXT');
      expect(next.latest?.errorCode).toBe('TOO_LITTLE_TEXT');
    });

    it('returns error on REPORT_GENERATION_FAILED', () => {
      const current: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'processing',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(
        current,
        makeWebhook(WebhookEvent.ReportGenerationFailed, {
          error_message: 'PDF engine crashed',
        }),
      )!;
      expect(getCurrentTextIntegrityState(next)).toBe('error');
      expect(getTextIntegrityError(next)).toBe('PDF engine crashed');
    });
  });

  describe('State Transitions', () => {
    it('Submission processing -> completed', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, makeWebhook(WebhookEvent.SubmissionComplete));
      expect(next?.stages.submission.status).toBe('completed');
      expect(next?.stages.processing?.status).toBe('pending');
    });

    it('Submission processing -> error (SUBMISSION_FAILED)', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.SubmissionFailed, { error_message: 'Invalid file' }),
      );
      expect(next?.stages.submission.status).toBe('error');
      expect(next?.stages.submission.error).toBe('Invalid file');
    });

    it('Processing pending -> processing (PROCESSING_PHASE_STARTED)', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'pending', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, makeWebhook(WebhookEvent.ProcessingPhaseStarted));
      expect(next?.stages.processing?.status).toBe('processing');
    });

    it('Processing processing -> completed (PROCESSING_PHASE_COMPLETE)', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, processingCompleteWebhook());
      expect(next?.stages.processing?.status).toBe('completed');
      expect(next?.stages.reportGeneration?.status).toBe('pending');
    });

    it('Report generation pending -> processing (REPORT_GENERATION_STARTED)', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'pending',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(initial, makeWebhook(WebhookEvent.ReportGenerationStarted));
      expect(next?.stages.reportGeneration?.status).toBe('processing');
    });

    it('Report generation processing -> completed (REPORT_GENERATION_COMPLETE)', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'processing',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(initial, reportCompleteWebhook());
      expect(next?.stages.reportGeneration?.status).toBe('completed');
    });

    it('Report generation processing -> error (REPORT_GENERATION_FAILED)', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'processing',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.ReportGenerationFailed, {
          error_message: 'Timeout',
        }),
      );
      expect(next?.stages.reportGeneration?.status).toBe('error');
      expect(next?.stages.reportGeneration?.error).toBe('Timeout');
    });
  });

  describe('Late notification catch-up', () => {
    it('PROCESSING_PHASE_STARTED when submission still processing -> catch up submission', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, makeWebhook(WebhookEvent.ProcessingPhaseStarted));
      expect(next?.stages.submission.status).toBe('notify-skipped');
      expect(next?.stages.processing?.status).toBe('processing');
    });

    it('PROCESSING_PHASE_COMPLETE when submission still processing -> catch up submission', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, processingCompleteWebhook());
      expect(next?.stages.submission.status).toBe('notify-skipped');
      expect(next?.stages.processing?.status).toBe('completed');
    });

    it('REPORT_GENERATION_STARTED when submission and processing never completed -> catch up both', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, makeWebhook(WebhookEvent.ReportGenerationStarted));
      expect(next?.stages.submission.status).toBe('notify-skipped');
      expect(next?.stages.processing?.status).toBe('notify-skipped');
      expect(next?.stages.reportGeneration?.status).toBe('processing');
    });

    it('REPORT_GENERATION_COMPLETE when earlier stages not completed -> catch up all', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'pending', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, reportCompleteWebhook());
      expect(next?.stages.submission.status).toBe('notify-skipped');
      expect(next?.stages.processing?.status).toBe('notify-skipped');
      expect(next?.stages.reportGeneration?.status).toBe('completed');
    });

    it('REPORT_GENERATION_FAILED when earlier stages not completed -> catch up preceding stages', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'pending', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.ReportGenerationFailed, {
          error_message: 'Engine error',
        }),
      );
      expect(next?.stages.submission.status).toBe('notify-skipped');
      expect(next?.stages.processing?.status).toBe('notify-skipped');
      expect(next?.stages.reportGeneration?.status).toBe('error');
    });
  });

  describe('Duplicate / no-op transitions return null', () => {
    it('SUBMISSION_COMPLETE when already completed', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'pending', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, makeWebhook(WebhookEvent.SubmissionComplete));
      expect(next).toBeNull();
    });

    it('PROCESSING_PHASE_STARTED when already processing', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(initial, makeWebhook(WebhookEvent.ProcessingPhaseStarted));
      expect(next).toBeNull();
    });

    it('PROCESSING_PHASE_COMPLETE when already completed without report payload is a no-op', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'pending',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.ProcessingPhaseComplete, { completed: true }),
      );
      expect(next).toBeNull();
    });

    it('PROCESSING_PHASE_COMPLETE when already completed refreshes summaryReport from similarity payload', () => {
      const initial: TextIntegrityDataSchema = {
        summaryReport: {
          submissionId: 'sub-123',
          status: 'COMPLETE',
          timeRequested: '2025-01-01T00:00:00Z',
          overallMatchPercentage: 12,
          internetMatchPercentage: 5,
          publicationMatchPercentage: 3,
          submittedWorksMatchPercentage: 4,
          topMatches: [],
          timeGenerated: '2025-01-01T00:01:00Z',
          topSourceLargestMatchedWordCount: 100,
        },
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.ProcessingPhaseComplete, {
          similarity_report: {
            ...SAMPLE_SIMILARITY_REPORT,
            overall_match_percentage: 7,
          },
        }),
      );
      expect(next?.stages.processing?.status).toBe('completed');
      expect(next?.summaryReport?.overallMatchPercentage).toBe(7);
      expect(next?.latest?.overallMatchPercentage).toBe(7);
      expect(next?.similarityReportPdfInvalidated).toBeUndefined();
    });

    it('SIMILARITY_UPDATED complete refreshes summaryReport and invalidates stored PDF', () => {
      const initial: TextIntegrityDataSchema = {
        summaryReport: {
          submissionId: 'sub-123',
          status: 'COMPLETE',
          timeRequested: '2025-01-01T00:00:00Z',
          overallMatchPercentage: 12,
          internetMatchPercentage: 5,
          publicationMatchPercentage: 3,
          submittedWorksMatchPercentage: 4,
          topMatches: [],
          timeGenerated: '2025-01-01T00:01:00Z',
          topSourceLargestMatchedWordCount: 100,
        },
        reportPdfId: 'pdf-001',
        similarityReportStored: true,
        storedReportPdfId: 'pdf-001',
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const receivedAt = '2025-01-01T00:10:00Z';
      const next = applyWebhookEvent(
        initial,
        similarityUpdatedWebhook(WebhookEvent.ProcessingPhaseComplete, 'COMPLETE', 4),
        receivedAt,
      );

      expect(next?.stages.processing?.status).toBe('completed');
      expect(next?.stages.reportGeneration?.status).toBe('completed');
      expect(next?.summaryReport?.overallMatchPercentage).toBe(4);
      expect(next?.similarityReportPdfInvalidated).toBe(true);
      expect(next?.similarityReportPdfInvalidatedAt).toBe(receivedAt);
      expect(next?.similarityReportPdfInvalidatedByEvent).toBe('SIMILARITY_UPDATED');
    });

    it('SIMILARITY_UPDATED processing refreshes summaryReport without rewinding completed processing', () => {
      const initial: TextIntegrityDataSchema = {
        reportPdfId: 'pdf-001',
        similarityReportStored: true,
        storedReportPdfId: 'pdf-001',
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const receivedAt = '2025-01-01T00:11:00Z';
      const next = applyWebhookEvent(
        initial,
        similarityUpdatedWebhook(WebhookEvent.ProcessingPhaseStarted, 'PROCESSING', 6),
        receivedAt,
      );

      expect(next?.stages.processing?.status).toBe('completed');
      expect(next?.stages.reportGeneration?.status).toBe('completed');
      expect(next?.summaryReport?.status).toBe('PROCESSING');
      expect(next?.summaryReport?.overallMatchPercentage).toBe(6);
      expect(next?.similarityReportPdfInvalidated).toBe(true);
      expect(next?.similarityReportPdfInvalidatedAt).toBe(receivedAt);
    });

    it('SIMILARITY_UPDATED complete before any PDF exists does not mark PDF invalidated', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'processing', history: [], timestamp: '2025-01-01T00:00:00Z' },
        },
      };
      const next = applyWebhookEvent(
        initial,
        similarityUpdatedWebhook(WebhookEvent.ProcessingPhaseComplete, 'COMPLETE', 5),
      );

      expect(next?.stages.processing?.status).toBe('completed');
      expect(next?.summaryReport?.overallMatchPercentage).toBe(5);
      expect(next?.similarityReportPdfInvalidated).toBeUndefined();
      expect(next?.similarityReportPdfInvalidatedAt).toBeUndefined();
      expect(next?.similarityReportPdfInvalidatedByEvent).toBeUndefined();
    });

    it('preserves SIMILARITY_UPDATED invalidation across unrelated processing-complete redelivery', () => {
      const initial: TextIntegrityDataSchema = {
        reportPdfId: 'pdf-001',
        similarityReportStored: true,
        storedReportPdfId: 'pdf-001',
        similarityReportPdfInvalidated: true,
        similarityReportPdfInvalidatedAt: '2025-01-01T00:10:00Z',
        similarityReportPdfInvalidatedByEvent: 'SIMILARITY_UPDATED',
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.ProcessingPhaseComplete, {
          similarity_report: {
            ...SAMPLE_SIMILARITY_REPORT,
            overall_match_percentage: 8,
          },
        }),
        '2025-01-01T00:20:00Z',
      );

      expect(next?.summaryReport?.overallMatchPercentage).toBe(8);
      expect(next?.similarityReportPdfInvalidated).toBe(true);
      expect(next?.similarityReportPdfInvalidatedAt).toBe('2025-01-01T00:10:00Z');
      expect(next?.similarityReportPdfInvalidatedByEvent).toBe('SIMILARITY_UPDATED');
    });

    it('REPORT_GENERATION_STARTED when already processing', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'processing',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(initial, makeWebhook(WebhookEvent.ReportGenerationStarted));
      expect(next).toBeNull();
    });

    it('REPORT_GENERATION_COMPLETE when already completed refreshes pdf id for regeneration', () => {
      const initial: TextIntegrityDataSchema = {
        reportPdfId: 'pdf-001',
        reportPdfUrl: 'https://example.com/pdf-001',
        similarityReportStored: true,
        storedReportPdfId: 'pdf-001',
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.ReportGenerationComplete, {
          report: {
            report_id: 'pdf-002',
            report_pdf_url: 'https://example.com/pdf-002',
          },
        }),
      );
      expect(next?.reportPdfId).toBe('pdf-002');
      expect(next?.reportPdfUrl).toBe('https://example.com/pdf-002');
      expect(next?.stages.reportGeneration?.status).toBe('completed');
    });

    it('REPORT_GENERATION_COMPLETE clears stale similarity PDF invalidation flags', () => {
      const initial: TextIntegrityDataSchema = {
        reportPdfId: 'pdf-001',
        similarityReportPdfInvalidated: true,
        similarityReportPdfInvalidatedAt: '2025-01-01T00:10:00Z',
        similarityReportPdfInvalidatedByEvent: 'SIMILARITY_UPDATED',
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'processing',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.ReportGenerationComplete, {
          report: {
            report_id: 'pdf-002',
            report_pdf_url: 'https://example.com/pdf-002',
          },
        }),
      );

      expect(next?.reportPdfId).toBe('pdf-002');
      expect(next?.similarityReportPdfInvalidated).toBeUndefined();
      expect(next?.similarityReportPdfInvalidatedAt).toBeUndefined();
      expect(next?.similarityReportPdfInvalidatedByEvent).toBeUndefined();
    });

    it('REPORT_GENERATION_COMPLETE when already completed with same pdf id is a no-op', () => {
      const initial: TextIntegrityDataSchema = {
        reportPdfId: 'pdf-002',
        reportPdfUrl: 'https://api.example.com/api/v1/submissions/sub-1/similarity/pdf/pdf-002',
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      };
      const next = applyWebhookEvent(initial, reportCompleteWebhook());
      expect(next).toBeNull();
    });

    it('SUBMISSION_FAILED when already errored', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: {
            status: 'error',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
            error: 'prev error',
          },
        },
      };
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.SubmissionFailed, { error_message: 'dup' }),
      );
      expect(next).toBeNull();
    });

    it('REPORT_GENERATION_FAILED when already errored', () => {
      const initial: TextIntegrityDataSchema = {
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'error',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
            error: 'prev',
          },
        },
      };
      const next = applyWebhookEvent(
        initial,
        makeWebhook(WebhookEvent.ReportGenerationFailed, { error_message: 'dup' }),
      );
      expect(next).toBeNull();
    });
  });

  describe('Full happy-path walkthrough', () => {
    it('walks through the entire workflow from submission to report generation', () => {
      const t0 = '2025-01-01T00:00:00Z';
      let data: TextIntegrityDataSchema = startSubmission(undefined, t0);

      expect(data.stages.submission.status).toBe('processing');
      expect(getCurrentTextIntegrityState(data)).toBe('submitting');

      const t1 = '2025-01-01T00:01:00Z';
      data = applyWebhookEvent(data, makeWebhook(WebhookEvent.SubmissionComplete), t1)!;
      expect(data.stages.submission.status).toBe('completed');
      expect(data.stages.processing?.status).toBe('pending');
      expect(getCurrentTextIntegrityState(data)).toBe('submission_complete');

      const t2 = '2025-01-01T00:02:00Z';
      data = applyWebhookEvent(data, makeWebhook(WebhookEvent.ProcessingPhaseStarted), t2)!;
      expect(data.stages.processing?.status).toBe('processing');
      expect(getCurrentTextIntegrityState(data)).toBe('processing_requested');

      const t3 = '2025-01-01T00:03:00Z';
      data = applyWebhookEvent(data, processingCompleteWebhook(), t3)!;
      expect(data.stages.processing?.status).toBe('completed');
      expect(data.stages.reportGeneration?.status).toBe('pending');
      expect(getCurrentTextIntegrityState(data)).toBe('processing_complete');
      expect(data.summaryReport?.overallMatchPercentage).toBe(12);
      expect(data.reportPdfId).toBe('pdf-001');

      const t4 = '2025-01-01T00:04:00Z';
      data = applyWebhookEvent(data, makeWebhook(WebhookEvent.ReportGenerationStarted), t4)!;
      expect(data.stages.reportGeneration?.status).toBe('processing');
      expect(getCurrentTextIntegrityState(data)).toBe('report_generation_started');

      const t5 = '2025-01-01T00:05:00Z';
      data = applyWebhookEvent(data, reportCompleteWebhook(), t5)!;
      expect(data.stages.reportGeneration?.status).toBe('completed');
      expect(getCurrentTextIntegrityState(data)).toBe('report_generation_complete');
      expect(data.reportPdfId).toBe('pdf-002');

      expect(data.webhookHistory).toHaveLength(5);
      expect(data.webhookHistory![0].event).toBe(WebhookEvent.ReportGenerationComplete);
      expect(data.webhookHistory![4].event).toBe(WebhookEvent.SubmissionComplete);

      expect(data.stages.submission.history.length).toBeGreaterThan(0);
      expect(data.stages.processing?.history.length).toBeGreaterThan(0);
      expect(data.stages.reportGeneration?.history.length).toBeGreaterThan(0);
    });
  });

  describe('parseNotifyWebhookJson (relay envelopes)', () => {
    it('maps UPLOAD_ACCEPTED to SubmissionComplete', () => {
      const r = parseNotifyWebhookJson({
        event: 'UPLOAD_ACCEPTED',
        check_id: 'ext-1',
        client_id: 'run-1',
        payload: { upload_status: 'ACCEPTED' },
      });
      expect(r.ok).toBe(true);
      if (r.ok && 'webhook' in r) {
        expect(r.webhook.event).toBe(WebhookEvent.SubmissionComplete);
      } else {
        expect.fail('expected webhook branch');
      }
    });

    it('returns noop for UPLOAD_PENDING', () => {
      const r = parseNotifyWebhookJson({
        event: 'UPLOAD_PENDING',
        check_id: 'ext-1',
        payload: { upload_status: 'PENDING' },
      });
      expect(r.ok).toBe(true);
      if (r.ok && 'noop' in r) {
        expect(r.noop).toBe(true);
      } else {
        expect.fail('expected noop branch');
      }
    });

    it('preserves relay metadata on mapped notify webhooks', () => {
      const r = parseNotifyWebhookJson({
        event: 'PROCESSING_PHASE_COMPLETE',
        check_id: 'ext-1',
        client_id: 'run-1',
        payload: { completed: true },
        metadata: { provider_event: 'SIMILARITY_UPDATED' },
      });
      expect(r.ok).toBe(true);
      if (r.ok && 'webhook' in r) {
        expect(r.webhook.event).toBe(WebhookEvent.ProcessingPhaseComplete);
        expect(r.webhook.metadata).toEqual({ provider_event: 'SIMILARITY_UPDATED' });
      } else {
        expect.fail('expected webhook branch');
      }
    });
  });

  describe('ProcessingPhaseFailed', () => {
    it('marks processing stage error', () => {
      const t0 = '2025-01-01T00:00:00Z';
      let data = startSubmission(undefined, t0);
      data = applyWebhookEvent(data, makeWebhook(WebhookEvent.SubmissionComplete), t0)!;
      data = applyWebhookEvent(data, makeWebhook(WebhookEvent.ProcessingPhaseStarted), t0)!;
      const next = applyWebhookEvent(
        data,
        makeWebhook(WebhookEvent.ProcessingPhaseFailed, { error_message: 'phase blew up' }),
        t0,
      )!;
      expect(next?.stages.processing?.status).toBe('error');
      expect(next?.stages.processing?.error).toBe('phase blew up');
    });
  });
});
