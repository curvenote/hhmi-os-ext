/**
 * Proofig PDF Service
 *
 * Cloud Run worker that renders a Proofig report URL to PDF and stores it back on
 * workspace storage for a check service run.
 *
 * Flow (per Pub/Sub push message):
 * 1. Validate the business payload (report URL + work version / check run / cdn info).
 * 2. Open the report URL in headless Chromium and print it to a PDF (print media emulation
 *    so the Proofig print stylesheet applies, matching the manual "Save as PDF" flow).
 * 3. Upload the PDF to the work version CDN via the SCMS uploads API.
 * 4. Register the stored file back on the Proofig check run via the extension hook.
 * 5. Complete the job.
 *
 * Job lifecycle + temp folder handling are provided by `withPubSubHandler` from
 * `@curvenote/scms-tasks`.
 *
 * When `PROOFIG_PDF_RENDER_ONLY=1`, POST /test-render is also available for local smoke
 * tests that exercise only the Playwright render path (no job handshake, upload, or hooks).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import { withPubSubHandler, type HandlerContext, type SCMSClient } from '@curvenote/scms-tasks';
import {
  proofigReportStoragePath,
  validateProofigPdfPayload,
  validateRenderOnlyRequest,
  type ProofigPdfPayload,
} from './payload.js';
import { renderReportPdf } from './pdf/renderReportPdf.js';
import { isRenderOnlyTestMode } from './renderOnlyTestMode.js';
import { runRenderOnly } from './runRenderOnly.js';

function md5OfFile(localPath: string): string {
  const content = fs.readFileSync(localPath);
  return createHash('md5').update(content).digest('hex');
}

/** Remove URL query strings so worker failures cannot persist live report tokens. */
export function sanitizeWorkerError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/[^\s"'<>]+/g, (rawUrl) => {
    const trailing = rawUrl.match(/[),.;:]+$/)?.[0] ?? '';
    const candidate = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    try {
      const url = new URL(candidate);
      url.search = '';
      return `${url.toString()}${trailing}`;
    } catch {
      return `${candidate.replace(/\?.*$/, '')}${trailing}`;
    }
  });
}

/**
 * Register the stored PDF back on the Proofig check run via the extension hook
 * (`v1/hooks/proofig/pdf-stored/:checkRunId`). Uses the same handshake bearer the
 * SCMS client uses for job callbacks.
 */
async function registerStoredPdf(
  client: SCMSClient,
  handshake: string,
  payload: ProofigPdfPayload,
  file: { path: string; size: number; md5: string },
): Promise<void> {
  const base = client.works.getBaseUrl().replace(/\/$/, '');
  const url = `${base}/hooks/proofig/pdf-stored/${payload.check_service_run_id}`;
  const body = {
    work_version_id: payload.work_version_id,
    report_id: payload.report_id,
    path: file.path,
    size: file.size,
    md5: file.md5,
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(handshake ? { Authorization: `Bearer ${handshake}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Failed to register stored PDF (${response.status} ${response.statusText}): ${text}`,
    );
  }
}

async function runProductionJob(ctx: HandlerContext<unknown>): Promise<void> {
  const { client, payload, tmpFolder, res, attributes } = ctx;

  const data = validateProofigPdfPayload(payload);
  console.log('Rendering Proofig report to PDF', {
    check_service_run_id: data.check_service_run_id,
    work_version_id: data.work_version_id,
  });

  const { localPath, size } = await renderReportPdf({
    reportUrl: data.reportUrl,
    outputDir: tmpFolder,
  });

  const storagePath = proofigReportStoragePath(data.check_service_run_id);
  const md5 = md5OfFile(localPath);
  // `storagePath` is relative to cdn_key; uploadSingleFileToCdn returns the absolute
  // object key (`${cdnKey}/${storagePath}`), which the pdf-stored hook validates.
  const upload = await client.uploads.uploadSingleFileToCdn({
    cdn: data.cdn,
    cdnKey: data.cdn_key,
    localPath,
    storagePath,
  });

  await registerStoredPdf(client, attributes.handshake, data, {
    path: upload.path,
    size,
    md5,
  });

  await client.jobs.completed(res, 'Proofig report PDF stored on work version CDN', {
    check_service_run_id: data.check_service_run_id,
    path: upload.path,
    size,
  });
}

/** Production boundary: sanitize failures before withPubSubHandler persists them. */
export async function handleProductionJob(ctx: HandlerContext<unknown>): Promise<void> {
  try {
    await runProductionJob(ctx);
  } catch (error) {
    throw new Error(sanitizeWorkerError(error));
  }
}

/**
 * Creates and configures the Express service.
 */
export function createService() {
  const app = express();
  app.use(express.json());

  app.get('/', (_req, res) => {
    const mode = isRenderOnlyTestMode() ? ' (render-only test mode enabled)' : '';
    return res.send(`Curvenote Proofig PDF Service${mode}`);
  });

  if (isRenderOnlyTestMode()) {
    app.post('/test-render', async (req, res) => {
      try {
        const { reportUrl } = validateRenderOnlyRequest(req.body);
        console.log('[test-render] Rendering Proofig report to PDF', { reportUrl });
        const result = await runRenderOnly(reportUrl);
        console.log('[test-render] Render complete', result);
        return res.status(200).json({ ok: true, ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[test-render] Render failed', message);
        return res.status(400).json({ ok: false, error: message });
      }
    });
  }

  app.post('/', withPubSubHandler<unknown>(handleProductionJob));

  return app;
}
