// eslint-disable-next-line import/no-extraneous-dependencies
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { writeSimilarityPdfToStorage } from './write-similarity-pdf-to-storage.server.js';

describe('writeSimilarityPdfToStorage', () => {
  it('writes only the PDF byte range and returns matching md5/size', async () => {
    const pooled = Buffer.allocUnsafe(8192);
    pooled.fill(0xff);
    const view = pooled.subarray(0, 50);
    view.fill(0xcd);

    let writtenLength = 0;
    let writtenBuffer: ArrayBuffer | undefined;
    const file = {
      writeArrayBuffer: vi.fn(async (buffer: ArrayBuffer) => {
        writtenBuffer = buffer;
        writtenLength = buffer.byteLength;
      }),
    };

    const result = await writeSimilarityPdfToStorage(file, view);

    expect(writtenLength).toBe(50);
    expect(writtenBuffer?.byteLength).toBe(50);
    expect(result.size).toBe(50);
    const expectedMd5 = createHash('md5').update(new Uint8Array(view)).digest('hex');
    expect(result.md5).toBe(expectedMd5);
  });
});
