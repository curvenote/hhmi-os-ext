// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import {
  type LinearStage,
  type LinearStageStatus,
  type TextIntegrityDataSchema,
  hasError,
  hasPipelineError,
  isAwaitingInitialTextIntegrityStages,
  isWaitingForPdfReport,
  shouldPollTextIntegrityChecks,
  textIntegrityDataSchema,
  getRetrySupersessionInfo,
} from './serviceDataSchemas.js';

const TS = '2025-01-01T00:00:00Z';

function stage(status: LinearStageStatus): LinearStage {
  return { status, history: [], timestamp: TS };
}

function dataWithReportStatus(
  reportStatus: LinearStageStatus | undefined,
  processingStatus: LinearStageStatus = 'completed',
): TextIntegrityDataSchema {
  return {
    stages: {
      submission: stage('completed'),
      processing: stage(processingStatus),
      ...(reportStatus == null ? {} : { reportGeneration: stage(reportStatus) }),
    },
  };
}

describe('hasPipelineError', () => {
  it('returns true only for submission or processing errors', () => {
    expect(
      hasPipelineError({
        stages: {
          submission: stage('completed'),
          processing: stage('error'),
          reportGeneration: stage('pending'),
        },
      }),
    ).toBe(true);
    expect(
      hasPipelineError({
        stages: {
          submission: stage('completed'),
          processing: stage('completed'),
          reportGeneration: stage('error'),
        },
      }),
    ).toBe(false);
  });
});

describe('getRetrySupersessionInfo', () => {
  it('returns supersession info when both lineage fields are set', () => {
    expect(
      getRetrySupersessionInfo({
        stages: { submission: stage('error') },
        supersededByRunId: 'new-run',
        supersededAt: TS,
      }),
    ).toEqual({ supersededByRunId: 'new-run', supersededAt: TS });
  });

  it('returns null when lineage fields are missing or blank', () => {
    expect(getRetrySupersessionInfo(undefined)).toBeNull();
    expect(getRetrySupersessionInfo({ stages: { submission: stage('error') } })).toBeNull();
    expect(
      getRetrySupersessionInfo({
        stages: { submission: stage('error') },
        supersededByRunId: '  ',
        supersededAt: TS,
      }),
    ).toBeNull();
  });
});

describe('hasError', () => {
  it('returns true when report generation errored', () => {
    expect(
      hasError({
        stages: {
          submission: stage('completed'),
          processing: stage('completed'),
          reportGeneration: stage('error'),
        },
      }),
    ).toBe(true);
  });

  it('returns true when any Text Integrity stage has errored', () => {
    expect(
      hasError({
        stages: {
          submission: stage('completed'),
          processing: stage('error'),
          reportGeneration: stage('pending'),
        },
      }),
    ).toBe(true);
  });

  it('returns false when stages are missing or no stage has errored', () => {
    expect(hasError(undefined)).toBe(false);
    expect(
      hasError({
        stages: {
          submission: stage('completed'),
          processing: stage('processing'),
          reportGeneration: stage('pending'),
        },
      }),
    ).toBe(false);
  });
});

describe('isWaitingForPdfReport', () => {
  it.each<LinearStageStatus>(['pending', 'processing'])(
    'returns true when reportGeneration.status is %s',
    (status) => {
      expect(isWaitingForPdfReport(dataWithReportStatus(status))).toBe(true);
    },
  );

  it.each<LinearStageStatus>(['completed', 'notify-skipped', 'error'])(
    'returns false when reportGeneration.status is %s',
    (status) => {
      expect(isWaitingForPdfReport(dataWithReportStatus(status))).toBe(false);
    },
  );

  it('returns false when metadata, stages, or reportGeneration are missing', () => {
    expect(isWaitingForPdfReport(undefined)).toBe(false);
    expect(
      isWaitingForPdfReport({
        stages: {
          submission: stage('completed'),
          processing: stage('completed'),
        },
      }),
    ).toBe(false);
  });
});

describe('shouldPollTextIntegrityChecks', () => {
  it('polls while awaiting initial stages after dispatch (poll-before-run window)', () => {
    expect(shouldPollTextIntegrityChecks(undefined, 'run-1')).toBe(true);
    expect(isAwaitingInitialTextIntegrityStages(undefined, 'run-1')).toBe(true);
  });

  it('does not poll without a check run id or stamped stages', () => {
    expect(shouldPollTextIntegrityChecks(undefined, undefined)).toBe(false);
    expect(shouldPollTextIntegrityChecks(undefined, '   ')).toBe(false);
  });

  it('polls while pipeline stages are in progress before results are available', () => {
    const inProgress: TextIntegrityDataSchema = {
      stages: {
        submission: stage('completed'),
        processing: stage('processing'),
        reportGeneration: stage('pending'),
      },
    };
    expect(shouldPollTextIntegrityChecks(inProgress, 'run-1')).toBe(true);
  });

  it('continues polling after results are shown while the PDF report is still generating', () => {
    const waitingForPdf = dataWithReportStatus('processing');
    expect(shouldPollTextIntegrityChecks(waitingForPdf, 'run-1')).toBe(true);

    const pendingPdf = dataWithReportStatus('pending');
    expect(shouldPollTextIntegrityChecks(pendingPdf, 'run-1')).toBe(true);
  });

  it('continues polling when PDF generation is complete but the current PDF is not stored yet', () => {
    const done = dataWithReportStatus('completed');
    done.reportPdfId = 'pdf-current';
    done.storedReportPdfId = 'pdf-previous';
    done.similarityReportStored = true;
    expect(shouldPollTextIntegrityChecks(done, 'run-1')).toBe(true);
  });

  it('continues polling while an invalidated PDF is regenerating', () => {
    const regenerating = dataWithReportStatus('processing');
    regenerating.reportPdfId = 'pdf-stale';
    regenerating.storedReportPdfId = 'pdf-stale';
    regenerating.similarityReportStored = true;
    regenerating.similarityReportPdfInvalidated = true;
    expect(shouldPollTextIntegrityChecks(regenerating, 'run-1')).toBe(true);
  });

  it('stops polling when the completed PDF is invalidated and no regeneration is in flight', () => {
    const invalidated = dataWithReportStatus('completed');
    invalidated.reportPdfId = 'pdf-stale';
    invalidated.storedReportPdfId = 'pdf-stale';
    invalidated.similarityReportStored = true;
    invalidated.similarityReportPdfInvalidated = true;
    expect(shouldPollTextIntegrityChecks(invalidated, 'run-1')).toBe(false);
  });

  it('stops polling when processing and the current PDF are complete', () => {
    const done = dataWithReportStatus('completed');
    done.reportPdfId = 'pdf-current';
    done.storedReportPdfId = 'pdf-current';
    done.similarityReportStored = true;
    expect(shouldPollTextIntegrityChecks(done, 'run-1')).toBe(false);
  });

  it('stops polling when report generation errors even though results can be shown', () => {
    const errored = dataWithReportStatus('error');
    expect(shouldPollTextIntegrityChecks(errored, 'run-1')).toBe(false);
  });
});

describe('textIntegrityDataSchema PDF invalidation fields', () => {
  it('accepts optional archived PDF invalidation metadata', () => {
    const parsed = textIntegrityDataSchema.parse({
      ...dataWithReportStatus('completed'),
      similarityReportPdfInvalidated: true,
      similarityReportPdfInvalidatedAt: '2025-01-01T08:00:00Z',
      similarityReportPdfInvalidatedByEvent: 'SIMILARITY_UPDATED',
    });

    expect(parsed.similarityReportPdfInvalidated).toBe(true);
    expect(parsed.similarityReportPdfInvalidatedAt).toBe('2025-01-01T08:00:00Z');
    expect(parsed.similarityReportPdfInvalidatedByEvent).toBe('SIMILARITY_UPDATED');
  });
});
