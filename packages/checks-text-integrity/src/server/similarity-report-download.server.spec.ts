// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { MINIMAL_TEXT_INTEGRITY_SERVICE_DATA } from '../schema.js';
import { buildSimilarityReportFileEntry } from './similarity-report-storage.server.js';
import { resolveSimilarityReportDownloadSource } from './similarity-report-download.server.js';

describe('resolveSimilarityReportDownloadSource', () => {
  it('prefers storage when serviceData has a generated-slot file', () => {
    const path = 'wv-key/generated/run-1/similarity-report.pdf';
    const data = {
      ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
      reportPdfId: 'pdf-1',
      similarityReportStored: true,
      storedReportPdfId: 'pdf-1',
      files: {
        [path]: buildSimilarityReportFileEntry(path, 100, 'abc', '2025-01-01'),
      },
    };
    expect(resolveSimilarityReportDownloadSource(data)).toEqual({
      kind: 'storage',
      path,
      contentType: 'application/pdf',
      filename: 'similarity-report.pdf',
    });
  });

  it('returns pending when nothing is stored', () => {
    expect(resolveSimilarityReportDownloadSource(MINIMAL_TEXT_INTEGRITY_SERVICE_DATA)).toEqual({
      kind: 'pending',
      reason: 'unstored',
    });
  });

  it('returns stale pending when the stored PDF has been invalidated', () => {
    const path = 'wv-key/generated/run-1/similarity-report.pdf';
    const data = {
      ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
      reportPdfId: 'pdf-1',
      similarityReportStored: true,
      storedReportPdfId: 'pdf-1',
      similarityReportPdfInvalidated: true,
      files: {
        [path]: buildSimilarityReportFileEntry(path, 100, 'abc', '2025-01-01'),
      },
    };

    expect(resolveSimilarityReportDownloadSource(data)).toEqual({
      kind: 'pending',
      reason: 'stale',
    });
  });

  it('returns processing pending while report generation is in progress', () => {
    expect(
      resolveSimilarityReportDownloadSource({
        ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
        stages: {
          ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages,
          reportGeneration: {
            status: 'processing',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      }),
    ).toEqual({
      kind: 'pending',
      reason: 'processing',
    });
  });

  it('does not serve a stale stored file for a different current PDF id', () => {
    const path = 'wv-key/generated/run-1/similarity-report.pdf';
    const data = {
      ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
      reportPdfId: 'pdf-2',
      similarityReportStored: true,
      storedReportPdfId: 'pdf-1',
      files: {
        [path]: buildSimilarityReportFileEntry(path, 100, 'abc', '2025-01-01'),
      },
    };

    expect(resolveSimilarityReportDownloadSource(data)).toEqual({
      kind: 'pending',
      reason: 'unstored',
    });
  });
});
