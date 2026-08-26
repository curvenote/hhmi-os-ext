import { describe, expect, it } from 'vitest';
import type { TextIntegrityDataSchema } from '../schema.js';
import {
  SIMILARITY_REPORT_GENERATED_SLOT,
  buildSimilarityReportFileEntry,
  getStoredSimilarityReportFile,
  shouldPersistSimilarityReport,
  similarityReportStoragePath,
} from './similarity-report-storage.server.js';

describe('similarity-report-storage', () => {
  it('builds a stable path under cdn_key', () => {
    expect(similarityReportStoragePath('wv-key-1', 'run-abc')).toBe(
      'wv-key-1/generated/run-abc/similarity-report.pdf',
    );
  });

  it('shouldPersist when reportPdfId exists and not yet stored', () => {
    const data = {
      reportPdfId: 'pdf-1',
    } as TextIntegrityDataSchema;
    expect(shouldPersistSimilarityReport(data)).toBe(true);
  });

  it('shouldPersist when reportPdfId changed after restart', () => {
    const data = {
      reportPdfId: 'pdf-2',
      similarityReportStored: true,
      storedReportPdfId: 'pdf-1',
    } as TextIntegrityDataSchema;
    expect(shouldPersistSimilarityReport(data)).toBe(true);
  });

  it('skips persist when same reportPdfId already stored', () => {
    const data = {
      reportPdfId: 'pdf-1',
      similarityReportStored: true,
      storedReportPdfId: 'pdf-1',
    } as TextIntegrityDataSchema;
    expect(shouldPersistSimilarityReport(data)).toBe(false);
  });

  it('finds stored file by generated slot', () => {
    const path = 'key/generated/run-1/similarity-report.pdf';
    const entry = buildSimilarityReportFileEntry(path, 100, 'abc', '2025-01-01');
    const data = {
      stages: {
        submission: { status: 'completed', history: [], timestamp: '2025-01-01' },
      },
      files: { [path]: entry },
      similarityReportStored: true,
    } as TextIntegrityDataSchema;
    expect(getStoredSimilarityReportFile(data)?.slot).toBe(SIMILARITY_REPORT_GENERATED_SLOT);
    expect(getStoredSimilarityReportFile(data)?.path).toBe(path);
  });
});
