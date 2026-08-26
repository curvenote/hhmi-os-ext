import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PROOFIG_REPORT_FILENAME } from './payload.js';
import { renderReportPdf } from './pdf/renderReportPdf.js';
import { renderOutputDir } from './renderOnlyTestMode.js';

export type RenderOnlyResult = {
  size: number;
  md5: string;
  /** Path inside the container temp dir (ephemeral unless RENDER_OUTPUT_DIR is set). */
  localPath: string;
  /** When RENDER_OUTPUT_DIR is set, path of the copied artifact on the mounted volume. */
  outputPath?: string;
};

function md5OfFile(localPath: string): string {
  const content = fs.readFileSync(localPath);
  return createHash('md5').update(content).digest('hex');
}

/**
 * Render a Proofig report URL to PDF without SCMS job callbacks, upload, or hooks.
 */
export async function runRenderOnly(reportUrl: string): Promise<RenderOnlyResult> {
  const tmpFolder = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'proofig-render-only-'));
  try {
    const { localPath, size } = await renderReportPdf({
      reportUrl,
      outputDir: tmpFolder,
      filename: PROOFIG_REPORT_FILENAME,
    });
    const md5 = md5OfFile(localPath);

    const outputDir = renderOutputDir();
    if (outputDir) {
      await fsPromises.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, PROOFIG_REPORT_FILENAME);
      await fsPromises.copyFile(localPath, outputPath);
      return { size, md5, localPath, outputPath };
    }

    return { size, md5, localPath };
  } finally {
    await fsPromises.rm(tmpFolder, { recursive: true, force: true });
  }
}
