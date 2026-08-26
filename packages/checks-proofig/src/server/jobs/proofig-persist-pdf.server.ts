import type { CreateJob } from '@curvenote/scms-core';
import type { Context } from '@curvenote/scms-server';
import { JobStatus } from '@curvenote/scms-db';
import { httpError } from '@curvenote/scms-core';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { createHandshakeToken, getPrismaClient, jobs, workerJobUrl } from '@curvenote/scms-server';
import { proofigDataSchema } from '../../schema.js';
import {
  currentProofigReportId,
  markProofigReportPdfError,
  shouldPersistProofigReport,
} from '../../proofigReportFiles.js';
import { getProofigConfigWithOverrides } from '../config.server.js';
import { getProofingToken } from '../proofigAuth.server.js';
import {
  proofigReportUrlWithAccessToken,
  rewriteReportUrlForDockerWorker,
} from '../proofigReportUrl.server.js';
import {
  dispatchProofigPdfService,
  readPdfServiceConfig,
} from '../dispatchProofigPdfService.server.js';
import { patchProofigRunServiceData } from '../checkRunColumns.server.js';
import { PROOFIG_PERSIST_PDF } from './proofigPersistPdf.constants.js';

export { PROOFIG_PERSIST_PDF };

const CreateProofigPersistPdfJobPayloadSchema = z.object({
  work_version_id: z.string().uuid('work_version_id is required'),
  check_service_run_id: z.string().min(1, 'check_service_run_id is required'),
  /** Report id this job was enqueued for (used for stale follow-up detection). */
  report_id: z.string().min(1).optional(),
  /** Bypass idempotency and overwrite the stored PDF (manual regenerate). */
  force: z.boolean().optional(),
});

export type CreateProofigPersistPdfJobPayload = z.infer<
  typeof CreateProofigPersistPdfJobPayloadSchema
>;

type CheckServiceRunData = {
  serviceData?: unknown;
};

async function failPersistPdfJob(
  jobId: string,
  checkServiceRunId: string,
  message: string,
  targetedReportId?: string,
) {
  // Write error onto the check run immediately; the FAILURE cleanup dependent also does this
  // for worker-path failures (and as a redundant write for dispatcher failures).
  try {
    await patchProofigRunServiceData(checkServiceRunId, (sd) =>
      markProofigReportPdfError(sd, message, undefined, targetedReportId),
    );
  } catch (err) {
    console.error('[proofig] failed to record PDF persist error on check run', {
      checkServiceRunId,
      jobId,
      err,
    });
  }
  return jobs.dbUpdateJob(jobId, { status: JobStatus.FAILED, message });
}

/**
 * PROOFIG_PERSIST_PDF job handler.
 *
 * Thin dispatcher (mirrors CONVERTER_TASK): it does not render the PDF itself. It builds a
 * fully-formed report URL (with a fresh Proofig access token), mints a handshake + job callback
 * URL, and publishes a Pub/Sub message to the proofig-pdf-service Cloud Run worker. The worker
 * renders + uploads the PDF, registers it via the pdf-stored hook, and PATCHes this job to
 * COMPLETED/FAILED using the handshake.
 */
export async function proofigPersistPdfHandler(ctx: Context, data: CreateJob) {
  const parseResult = CreateProofigPersistPdfJobPayloadSchema.safeParse(data.payload);
  if (!parseResult.success) {
    const msg = parseResult.error.issues.map((e) => e.message).join('; ');
    throw httpError(400, `Invalid PROOFIG_PERSIST_PDF payload: ${msg}`);
  }
  const payload = parseResult.data;

  const prisma = await getPrismaClient();
  const [run, workVersion] = await Promise.all([
    prisma.checkServiceRun.findUnique({ where: { id: payload.check_service_run_id } }),
    prisma.workVersion.findUnique({ where: { id: payload.work_version_id } }),
  ]);

  if (!run || run.work_version_id !== payload.work_version_id) {
    throw httpError(404, 'Check run not found for work version');
  }
  if (!workVersion) {
    throw httpError(404, `Work version ${payload.work_version_id} not found`);
  }
  if (!workVersion.cdn?.trim() || !workVersion.cdn_key?.trim()) {
    throw httpError(422, `Work version ${payload.work_version_id} has no cdn / cdn_key`);
  }

  const runData = run.data as CheckServiceRunData | null;
  const parsedSd = proofigDataSchema.safeParse(runData?.serviceData);
  const serviceData = parsedSd.success ? parsedSd.data : undefined;
  if (!serviceData) {
    throw httpError(422, 'Check run has no valid Proofig serviceData');
  }

  const targetedReportId = payload.report_id ?? currentProofigReportId(serviceData);

  const job = await jobs.dbStartJob({ ...data, status: JobStatus.RUNNING });
  await prisma.linkedJob.create({
    data: {
      id: uuidv7(),
      date_created: job.date_created,
      job_id: job.id,
      work_version_id: payload.work_version_id,
    },
    select: { id: true },
  });

  // Idempotency: skip when already stored for this report id (unless forced).
  if (!payload.force && !shouldPersistProofigReport(serviceData)) {
    return jobs.dbUpdateJob(job.id, {
      status: JobStatus.COMPLETED,
      message: 'Proofig report PDF already stored for this report id',
      results: { skipped: true, check_service_run_id: payload.check_service_run_id },
    });
  }

  const storedReportUrl =
    serviceData.reportUrl?.trim() || serviceData.summary?.reportUrl?.trim() || '';
  if (!storedReportUrl) {
    return failPersistPdfJob(
      job.id,
      payload.check_service_run_id,
      'No Proofig report URL stored on this run; cannot render PDF',
      targetedReportId,
    );
  }

  const baseConfig =
    (ctx.$config.app?.extensions?.['checks-proofig'] as Record<string, unknown>) ?? {};
  const mergedConfig = await getProofigConfigWithOverrides(baseConfig, prisma);

  const pdfService = readPdfServiceConfig(mergedConfig);
  if (!pdfService) {
    return failPersistPdfJob(
      job.id,
      payload.check_service_run_id,
      'checks-proofig pdfService.topic not configured; cannot dispatch PDF render',
      targetedReportId,
    );
  }

  const apiBaseUrl =
    (mergedConfig.apiBaseUrl as string | undefined)?.trim() || process.env.PROOFIG_API_BASE_URL;
  if (!apiBaseUrl?.trim()) {
    return failPersistPdfJob(
      job.id,
      payload.check_service_run_id,
      'checks-proofig apiBaseUrl not configured; cannot refresh report token',
      targetedReportId,
    );
  }

  let reportUrl: string;
  try {
    const token = await getProofingToken(apiBaseUrl, mergedConfig);
    reportUrl = proofigReportUrlWithAccessToken(storedReportUrl, token);
    // Local Docker PDF worker cannot reach host loopback; rewrite only on the
    // dispatched payload when devLocalPushUrl is set (stored reportUrl unchanged).
    if (pdfService.devLocalPushUrl) {
      reportUrl = rewriteReportUrlForDockerWorker(reportUrl);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build report URL';
    return failPersistPdfJob(job.id, payload.check_service_run_id, message, targetedReportId);
  }

  const handshake = createHandshakeToken(
    job.id,
    PROOFIG_PERSIST_PDF,
    ctx.$config.api.handshakeIssuer,
    ctx.$config.api.handshakeSigningSecret,
  );
  const jobUrl = workerJobUrl(ctx, `/jobs/${job.id}`);
  const userId = ctx.user?.id ?? 'system';

  let messageId: string;
  try {
    messageId = await dispatchProofigPdfService(
      { handshake, jobUrl, userId },
      {
        reportUrl,
        work_version_id: payload.work_version_id,
        check_service_run_id: payload.check_service_run_id,
        cdn: workVersion.cdn,
        cdn_key: workVersion.cdn_key,
        report_id: targetedReportId ?? serviceData.reportId,
        force: payload.force,
      },
      pdfService,
    );
  } catch (err) {
    // Job is already RUNNING via dbStartJob; mark FAILED so Pub/Sub failures do not leave a
    // stuck RUNNING row with no worker callback (and so transient retries cannot re-enter).
    const message =
      err instanceof Error
        ? `Failed to publish Proofig PDF render message: ${err.message}`
        : 'Failed to publish Proofig PDF render message';
    return failPersistPdfJob(job.id, payload.check_service_run_id, message, targetedReportId);
  }

  return jobs.dbUpdateJob(job.id, {
    status: JobStatus.RUNNING,
    message: 'Proofig PDF render message published to Cloud Run worker',
    results: { pubsubMessageId: messageId, check_service_run_id: payload.check_service_run_id },
  });
}
