// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import {
  MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
  type TextIntegrityDataSchema,
  WebhookEvent,
} from '../schema.js';
import {
  resolveServiceDataAfterNotifyWebhook,
  shouldEnqueuePersistPdfNotify,
} from './notify-persist-enqueue.server.js';

function reportCompleteData(pdfId: string): TextIntegrityDataSchema {
  return {
    ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
    stages: {
      ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages,
      reportGeneration: {
        status: 'completed',
        history: [],
        timestamp: '2025-01-01T00:00:00Z',
      },
    },
    reportPdfId: pdfId,
  };
}

describe('notify-persist-enqueue', () => {
  it('enqueues when report is complete and PDF not yet stored', () => {
    const data = reportCompleteData('pdf-1');
    const webhook = {
      event: WebhookEvent.ReportGenerationComplete,
      payload: { report: { report_id: 'pdf-1' } },
    };
    expect(shouldEnqueuePersistPdfNotify(webhook, data)).toBe(true);
  });

  it('does not enqueue when PDF already stored for this id', () => {
    const data = {
      ...reportCompleteData('pdf-1'),
      similarityReportStored: true,
      storedReportPdfId: 'pdf-1',
    };
    const webhook = { event: WebhookEvent.ReportGenerationComplete, payload: {} };
    expect(shouldEnqueuePersistPdfNotify(webhook, data)).toBe(false);
  });

  it('still enqueues on redelivered REPORT_GENERATION_COMPLETE when persist never succeeded', () => {
    const current = reportCompleteData('pdf-1');
    const webhook = {
      event: WebhookEvent.ReportGenerationComplete,
      payload: { report: { report_id: 'pdf-1' } },
    };
    const after = resolveServiceDataAfterNotifyWebhook(current, webhook, '2025-01-02T00:00:00Z');
    expect(after).toBe(current);
    expect(shouldEnqueuePersistPdfNotify(webhook, after)).toBe(true);
  });

  it('enqueues when a regenerated PDF id differs from the stored id', () => {
    const data = {
      ...reportCompleteData('pdf-2'),
      similarityReportStored: true,
      storedReportPdfId: 'pdf-1',
    };
    const webhook = {
      event: WebhookEvent.ReportGenerationComplete,
      payload: { report: { report_id: 'pdf-2' } },
    };
    expect(shouldEnqueuePersistPdfNotify(webhook, data)).toBe(true);
  });
});
