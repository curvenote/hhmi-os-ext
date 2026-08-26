// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { KnownState, MINIMAL_PROOFIG_SERVICE_DATA, type ProofigDataSchema } from './schema.js';
import {
  buildProofigReportFileEntry,
  clearProofigReportPdfError,
  clearProofigReportPdfRequested,
  clearStoredProofigReport,
  getProofigPdfAttemptState,
  getProofigPdfReadiness,
  hasStoredProofigReport,
  isProofigPdfGenerationInFlight,
  markProofigReportPdfError,
  markProofigReportPdfRequested,
  parseProofigPdfRequestStamp,
  PROOFIG_PDF_GENERATING_STALE_MS,
  replaceGeneratedProofigReport,
  shouldPersistProofigReport,
  summarizeProofigPdfError,
  withoutGeneratedProofigReportFiles,
} from './proofigReportFiles.js';

function finalReportData(overrides: Partial<ProofigDataSchema> = {}): ProofigDataSchema {
  return {
    ...MINIMAL_PROOFIG_SERVICE_DATA,
    reportId: 'report-1',
    reportUrl: 'https://proofig.example/report/1',
    summary: {
      state: KnownState.ReportClean,
      receivedAt: '2025-01-01T00:00:00Z',
    },
    stages: {
      ...MINIMAL_PROOFIG_SERVICE_DATA.stages,
      resultsReview: {
        status: 'completed',
        history: [],
        timestamp: '2025-01-01T00:00:00Z',
        outcome: 'clean',
      },
    },
    ...overrides,
  };
}

const GENERATED_PATH = 'cdn/generated/run/proofig-report.pdf';

function storedFileEntry(path = GENERATED_PATH) {
  return {
    name: 'proofig-report.pdf',
    path,
    size: 10,
    type: 'application/pdf',
    md5: 'abc',
    slot: 'generated' as const,
    uploadDate: '2025-01-01T00:00:00Z',
    label: 'Proofig report',
  };
}

describe('getProofigPdfReadiness', () => {
  it('returns not-final before the report stage', () => {
    expect(getProofigPdfReadiness(MINIMAL_PROOFIG_SERVICE_DATA)).toBe('not-final');
    expect(getProofigPdfReadiness(undefined)).toBe('not-final');
  });

  it('returns no-url when final but report URL is missing', () => {
    expect(
      getProofigPdfReadiness(
        finalReportData({
          reportUrl: undefined,
          summary: {
            state: KnownState.ReportClean,
            receivedAt: '2025-01-01T00:00:00Z',
          },
        }),
      ),
    ).toBe('no-url');
  });

  it('returns pending when final with URL but nothing stored yet', () => {
    expect(getProofigPdfReadiness(finalReportData())).toBe('pending');
  });

  it('returns failed when persist error is recorded and nothing is stored', () => {
    expect(
      getProofigPdfReadiness(
        finalReportData({
          proofigReportPdfError: 'Converter failed: page.goto net::ERR_CONNECTION_REFUSED',
          proofigReportPdfFailedAt: '2025-01-01T00:00:00Z',
        }),
      ),
    ).toBe('failed');
  });

  it('prefers stored-current over a stale error flag', () => {
    const stored = finalReportData({
      proofigReportStored: true,
      storedReportId: 'report-1',
      files: { [GENERATED_PATH]: storedFileEntry() },
      proofigReportPdfError: 'old error',
    });
    expect(getProofigPdfReadiness(stored)).toBe('stored-current');
  });

  it('returns stored-current when a PDF is stored for the current report id', () => {
    const stored = finalReportData({
      proofigReportStored: true,
      storedReportId: 'report-1',
      files: { [GENERATED_PATH]: storedFileEntry() },
    });
    expect(getProofigPdfReadiness(stored)).toBe('stored-current');
    expect(hasStoredProofigReport(stored)).toBe(true);
  });

  it('returns stored-stale when stored PDF is for a different report id', () => {
    const stale = finalReportData({
      reportId: 'report-2',
      proofigReportStored: true,
      storedReportId: 'report-1',
      files: { [GENERATED_PATH]: storedFileEntry() },
    });
    expect(getProofigPdfReadiness(stale)).toBe('stored-stale');
    expect(hasStoredProofigReport(stale)).toBe(false);
    expect(shouldPersistProofigReport(stale)).toBe(true);
  });
});

describe('withoutGeneratedProofigReportFiles / replaceGeneratedProofigReport', () => {
  it('removes only generated-slot entries and drops empty files maps', () => {
    const files = {
      [GENERATED_PATH]: storedFileEntry(),
      'cdn/other.pdf': {
        ...storedFileEntry('cdn/other.pdf'),
        slot: 'upload' as const,
        name: 'other.pdf',
      },
    };
    const next = withoutGeneratedProofigReportFiles(files);
    expect(next).toEqual({
      'cdn/other.pdf': expect.objectContaining({ path: 'cdn/other.pdf', slot: 'upload' }),
    });
    expect(
      withoutGeneratedProofigReportFiles({ [GENERATED_PATH]: storedFileEntry() }),
    ).toBeUndefined();
  });

  it('replaces any prior generated-slot file and marks the report stored', () => {
    const prior = finalReportData({
      proofigReportStored: true,
      storedReportId: 'report-old',
      proofigReportPdfRequestedAt: '2025-01-01T00:00:00Z',
      files: {
        'cdn/old/proofig-report.pdf': storedFileEntry('cdn/old/proofig-report.pdf'),
        'cdn/other.pdf': {
          ...storedFileEntry('cdn/other.pdf'),
          slot: 'upload' as const,
          name: 'other.pdf',
        },
      },
    });
    const entry = buildProofigReportFileEntry(GENERATED_PATH, 20, 'def', '2025-02-01T00:00:00Z');
    const next = replaceGeneratedProofigReport(prior, entry, 'report-1');

    expect(next.proofigReportStored).toBe(true);
    expect(next.storedReportId).toBe('report-1');
    expect(next.proofigReportPdfRequestedAt).toBeUndefined();
    expect(next.files?.[GENERATED_PATH]).toEqual(entry);
    expect(next.files?.['cdn/old/proofig-report.pdf']).toBeUndefined();
    expect(next.files?.['cdn/other.pdf']).toBeDefined();
  });

  it('falls back to serviceData.reportId when storedReportId arg is omitted', () => {
    const entry = buildProofigReportFileEntry(GENERATED_PATH, 20, 'def', '2025-02-01T00:00:00Z');
    const next = replaceGeneratedProofigReport(
      finalReportData({ reportId: 'report-1' }),
      entry,
      undefined,
    );
    expect(next.storedReportId).toBe('report-1');
  });
});

describe('clearStoredProofigReport', () => {
  it('clears stored flags and generated-slot files so persist can run again', () => {
    const stored = finalReportData({
      proofigReportStored: true,
      storedReportId: 'report-1',
      files: {
        [GENERATED_PATH]: storedFileEntry(),
      },
    });

    expect(hasStoredProofigReport(stored)).toBe(true);
    expect(shouldPersistProofigReport(stored)).toBe(false);

    const cleared = clearStoredProofigReport(stored);
    expect(hasStoredProofigReport(cleared)).toBe(false);
    expect(cleared.proofigReportStored).toBe(false);
    expect(cleared.storedReportId).toBeUndefined();
    expect(cleared.files).toBeUndefined();
    expect(shouldPersistProofigReport(cleared)).toBe(true);
    expect(getProofigPdfReadiness(cleared)).toBe('pending');
  });
});

describe('markProofigReportPdfError / summarizeProofigPdfError', () => {
  it('strips query strings and records a truncated error', () => {
    const marked = markProofigReportPdfError(
      finalReportData({ proofigReportPdfRequestedAt: '2025-01-01T00:00:00Z' }),
      'Converter failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/x?token=abc\nCall log:',
      '2025-01-02T00:00:00Z',
      'report-1',
    );
    expect(marked.proofigReportPdfError).toBe(
      'Converter failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/x',
    );
    expect(marked.proofigReportPdfFailedAt).toBe('2025-01-02T00:00:00Z');
    expect(marked.proofigReportPdfFailedReportId).toBe('report-1');
    expect(marked.proofigReportPdfRequestedAt).toBeUndefined();
    expect(getProofigPdfReadiness(marked)).toBe('failed');

    const cleared = clearProofigReportPdfError(marked);
    expect(cleared.proofigReportPdfError).toBeUndefined();
    expect(cleared.proofigReportPdfFailedReportId).toBeUndefined();
    expect(getProofigPdfReadiness(cleared)).toBe('pending');
  });

  it('summarizeProofigPdfError truncates long first lines', () => {
    const long = `error ${'x'.repeat(400)}`;
    expect(summarizeProofigPdfError(long).length).toBeLessThanOrEqual(280);
  });
});

describe('markProofigReportPdfRequested / clearProofigReportPdfRequested', () => {
  it('stamps and clears the enqueue request timestamp', () => {
    const stamped = markProofigReportPdfRequested(finalReportData(), '2025-03-01T12:00:00Z');
    expect(stamped.proofigReportPdfRequestedAt).toBe('2025-03-01T12:00:00Z');
    expect(clearProofigReportPdfRequested(stamped).proofigReportPdfRequestedAt).toBeUndefined();
  });
});

describe('parseProofigPdfRequestStamp', () => {
  it('returns parsed milliseconds for a valid trimmed request stamp', () => {
    expect(parseProofigPdfRequestStamp(' 2025-03-01T12:00:00Z ')).toBe(
      Date.parse('2025-03-01T12:00:00Z'),
    );
  });

  it('returns null for missing, empty, or invalid request stamps', () => {
    expect(parseProofigPdfRequestStamp(undefined)).toBeNull();
    expect(parseProofigPdfRequestStamp('')).toBeNull();
    expect(parseProofigPdfRequestStamp('   ')).toBeNull();
    expect(parseProofigPdfRequestStamp('not-a-date')).toBeNull();
  });
});

describe('isProofigPdfGenerationInFlight', () => {
  it('is true within the staleness bound and false after', () => {
    const now = Date.parse('2025-03-01T12:00:00Z');
    const stamped = markProofigReportPdfRequested(finalReportData(), '2025-03-01T12:00:00Z');
    expect(isProofigPdfGenerationInFlight(stamped, now)).toBe(true);
    expect(isProofigPdfGenerationInFlight(stamped, now + PROOFIG_PDF_GENERATING_STALE_MS - 1)).toBe(
      true,
    );
    expect(isProofigPdfGenerationInFlight(stamped, now + PROOFIG_PDF_GENERATING_STALE_MS)).toBe(
      false,
    );
  });

  it('is false when no stamp is present', () => {
    expect(isProofigPdfGenerationInFlight(finalReportData())).toBe(false);
    expect(isProofigPdfGenerationInFlight(undefined)).toBe(false);
  });
});

describe('getProofigPdfAttemptState', () => {
  const now = Date.parse('2025-03-01T12:00:00Z');

  it('returns generating for a fresh request even when an artifact is current', () => {
    const data = finalReportData({
      proofigReportStored: true,
      storedReportId: 'report-1',
      files: { [GENERATED_PATH]: storedFileEntry() },
      proofigReportPdfRequestedAt: '2025-03-01T12:00:00Z',
    });

    expect(getProofigPdfAttemptState(data, now)).toEqual({ status: 'generating' });
  });

  it('conservatively returns generating with a valid request stamp before a client clock exists', () => {
    const data = finalReportData({
      proofigReportPdfRequestedAt: '2025-03-01T12:00:00Z',
    });

    expect(getProofigPdfAttemptState(data, null)).toEqual({ status: 'generating' });
  });

  it('does not return generating without a valid request stamp before a client clock exists', () => {
    expect(getProofigPdfAttemptState(finalReportData(), null)).toEqual({ status: 'idle' });
    expect(
      getProofigPdfAttemptState(
        finalReportData({ proofigReportPdfRequestedAt: 'not-a-date' }),
        null,
      ),
    ).toEqual({ status: 'idle' });
  });

  it('returns idle after a request stamp becomes stale', () => {
    const data = finalReportData({
      proofigReportPdfRequestedAt: '2025-03-01T12:00:00Z',
    });

    expect(getProofigPdfAttemptState(data, now + PROOFIG_PDF_GENERATING_STALE_MS)).toEqual({
      status: 'idle',
    });
  });

  it('returns failed only when the failure targets the current report', () => {
    const currentFailure = finalReportData({
      proofigReportPdfError: 'render failed',
      proofigReportPdfFailedReportId: 'report-1',
    });
    const oldFailure = finalReportData({
      reportId: 'report-2',
      proofigReportPdfError: 'render failed',
      proofigReportPdfFailedReportId: 'report-1',
    });

    expect(getProofigPdfAttemptState(currentFailure, now)).toEqual({
      status: 'failed',
      error: 'render failed',
    });
    expect(getProofigPdfAttemptState(oldFailure, now)).toEqual({ status: 'idle' });
  });

  it('treats a legacy unscoped error as current conservatively', () => {
    expect(
      getProofigPdfAttemptState(
        finalReportData({ proofigReportPdfError: 'legacy render failed' }),
        now,
      ),
    ).toEqual({
      status: 'failed',
      error: 'legacy render failed',
    });
  });
});
