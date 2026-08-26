import { createHash } from 'node:crypto';
import { boundedPdfBytes } from './pdf-bytes.server.js';

export type WrittenSimilarityPdf = {
  md5: string;
  size: number;
};

export type SimilarityPdfWritable = {
  writeArrayBuffer(buffer: ArrayBuffer, contentType: string): Promise<void>;
};

/** Write PDF bytes to storage; returns hash metadata for serviceData.files. */
export async function writeSimilarityPdfToStorage(
  file: SimilarityPdfWritable,
  bytes: Uint8Array,
): Promise<WrittenSimilarityPdf> {
  const pdfBytes = boundedPdfBytes(bytes);
  const md5 = createHash('md5').update(pdfBytes).digest('hex');
  // boundedPdfBytes ensures byteOffset 0 and buffer length === byteLength
  await file.writeArrayBuffer(pdfBytes.buffer as ArrayBuffer, 'application/pdf');
  return { md5, size: pdfBytes.byteLength };
}
