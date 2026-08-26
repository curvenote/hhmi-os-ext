import type { FileMetadataSectionItem } from '@curvenote/scms-core';
import type { TextIntegrityDataSchema } from '../schema.js';

export const SIMILARITY_REPORT_GENERATED_SLOT = 'generated';
export const SIMILARITY_REPORT_FILENAME = 'similarity-report.pdf';

/** Storage object key for the persisted similarity PDF for a check run. */
export function similarityReportStoragePath(cdnKey: string, checkRunId: string): string {
  const prefix = cdnKey.replace(/\/$/, '');
  return `${prefix}/generated/${checkRunId}/${SIMILARITY_REPORT_FILENAME}`;
}

/** File entry keyed by storage path on check run `serviceData.files`. */
export function getStoredSimilarityReportFile(
  serviceData: TextIntegrityDataSchema | undefined,
): FileMetadataSectionItem | undefined {
  const files = serviceData?.files;
  if (!files || typeof files !== 'object') return undefined;
  for (const entry of Object.values(files)) {
    if (entry?.slot === SIMILARITY_REPORT_GENERATED_SLOT) return entry;
  }
  return undefined;
}

/** True when the persisted PDF matches the current provider PDF id. */
export function hasCurrentStoredSimilarityReport(serviceData: TextIntegrityDataSchema): boolean {
  const pdfId = serviceData.reportPdfId ?? serviceData.latest?.reportPdfId;
  return Boolean(
    pdfId &&
    serviceData.similarityReportStored === true &&
    serviceData.storedReportPdfId === pdfId &&
    getStoredSimilarityReportFile(serviceData)?.path,
  );
}

/** True when a PDF id exists and we have not yet stored that id (or never stored). */
export function shouldPersistSimilarityReport(serviceData: TextIntegrityDataSchema): boolean {
  const pdfId = serviceData.reportPdfId ?? serviceData.latest?.reportPdfId;
  if (!pdfId || typeof pdfId !== 'string') return false;
  if (!serviceData.similarityReportStored) return true;
  return serviceData.storedReportPdfId !== pdfId;
}

export function buildSimilarityReportFileEntry(
  storagePath: string,
  size: number,
  md5: string,
  uploadDate: string,
): FileMetadataSectionItem {
  return {
    name: SIMILARITY_REPORT_FILENAME,
    path: storagePath,
    size,
    type: 'application/pdf',
    md5,
    slot: SIMILARITY_REPORT_GENERATED_SLOT,
    uploadDate,
    label: 'Similarity report',
  };
}
