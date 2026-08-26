import type { TextIntegrityDataSchema } from '../schema.js';
import {
  SIMILARITY_REPORT_FILENAME,
  getStoredSimilarityReportFile,
  hasCurrentStoredSimilarityReport,
} from './similarity-report-storage.server.js';

export type SimilarityReportDownloadSource =
  | { kind: 'storage'; path: string; contentType: string; filename: string }
  | { kind: 'pending'; reason: 'stale' | 'processing' | 'unstored' };

/** Prefer persisted PDF on work storage when serviceData references it. */
export function resolveSimilarityReportDownloadSource(
  serviceData: TextIntegrityDataSchema,
): SimilarityReportDownloadSource {
  if (serviceData.similarityReportPdfInvalidated) {
    return { kind: 'pending', reason: 'stale' };
  }
  if (serviceData.stages?.reportGeneration?.status === 'processing') {
    return { kind: 'pending', reason: 'processing' };
  }
  const stored = hasCurrentStoredSimilarityReport(serviceData)
    ? getStoredSimilarityReportFile(serviceData)
    : undefined;
  if (stored?.path) {
    return {
      kind: 'storage',
      path: stored.path,
      contentType: stored.type || 'application/pdf',
      filename: stored.name || SIMILARITY_REPORT_FILENAME,
    };
  }
  return { kind: 'pending', reason: 'unstored' };
}
