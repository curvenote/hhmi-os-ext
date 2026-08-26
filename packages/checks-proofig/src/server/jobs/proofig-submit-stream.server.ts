import type { CreateJob } from '@curvenote/scms-core';
import type { Context } from '@curvenote/scms-server';
import { JobStatus } from '@curvenote/scms-db';
import { httpError, maintenanceGuardFromConfig } from '@curvenote/scms-core';
import type { WorkVersionMetadataPayload } from '@curvenote/common';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import {
  getPrismaClient,
  hooksNotifyBaseUrl,
  signFilesInMetadata,
  jobs,
} from '@curvenote/scms-server';
import { getProofigConfigWithOverrides } from '../config.server.js';
import { getProofingToken, invalidateProofingTokenCache } from '../proofigAuth.server.js';
import {
  buildProofigSubmitParams,
  getPdfFileFromMetadata,
  postToProofigStream,
  proofigSubmitErrorHasStatus,
  rollingLogEntry,
  workVersionToPayload,
} from './proofig-submit.utils.js';
import { MINIMAL_PROOFIG_SERVICE_DATA } from '../../schema.js';
import {
  completeInitialPostAndSetSubimageDetectionPending,
  completeDocumentPreparation,
  markInitialPostError,
  startInitialPostProcessing,
} from '../stateMachine.server.js';
import { patchProofigRunServiceData } from '../checkRunColumns.server.js';

function getErrorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message
    : ((err as { message?: string })?.message ?? String(err));
}

async function handleProofigSubmitJobFailure(
  jobId: string,
  proofigRunId: string,
  errorMessage: string,
  rollingLog: { message: string; data: unknown }[],
): Promise<Awaited<ReturnType<typeof jobs.dbUpdateJob>>> {
  const updatedJob = await jobs.dbUpdateJob(jobId, {
    status: JobStatus.FAILED,
    message: errorMessage,
    results: {
      rollingLog,
    },
  });
  await patchProofigRunServiceData(
    proofigRunId,
    (serviceData) =>
      markInitialPostError(
        serviceData ?? MINIMAL_PROOFIG_SERVICE_DATA,
        errorMessage,
        new Date().toISOString(),
      ),
    new Date().toISOString(),
    5,
    { trackTerminalAnalytics: true },
  );
  return updatedJob;
}

/** Job type for Proofig submit via in-process streaming HTTP call. */
export const PROOFIG_SUBMIT_STREAM = 'PROOFIG_SUBMIT_STREAM';

const CreateProofigSubmitJobPayloadSchema = z.object({
  work_version_id: z.string().uuid('work_version_id is required'),
  proofig_run_id: z.string().min(1, 'proofig_run_id is required'),
});

export type CreateProofigSubmitJobPayload = z.infer<typeof CreateProofigSubmitJobPayloadSchema>;

/**
 * PROOFIG_SUBMIT_STREAM job handler.
 * Runs the initial Proofig post synchronously by:
 * - Loading and signing work version metadata
 * - Streaming the PDF (via signedUrl) directly into a multipart/form-data POST to Proofig
 * - Completing the job with the Proofig response.
 */
export async function proofigSubmitStreamHandler(
  ctx: Context,
  data: CreateJob,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _storageBackend?: unknown,
) {
  const rollingLog: { message: string; data: unknown }[] = [];

  const parseResult = CreateProofigSubmitJobPayloadSchema.safeParse(data.payload);
  if (!parseResult.success) {
    const msg = parseResult.error.issues.map((e: { message: string }) => e.message).join('; ');
    throw httpError(400, `Invalid PROOFIG_SUBMIT_STREAM payload: ${msg}`);
  }
  const payload = parseResult.data;
  rollingLog.push(
    rollingLogEntry('payload validated', {
      work_version_id: payload.work_version_id,
      proofig_run_id: payload.proofig_run_id,
    }),
  );

  const prisma = await getPrismaClient();
  const workVersionRow = await prisma.workVersion.findUnique({
    where: { id: payload.work_version_id },
  });
  if (!workVersionRow) {
    throw httpError(404, `Work version ${payload.work_version_id} not found`);
  }
  rollingLog.push(rollingLogEntry('work version loaded', workVersionRow.id));

  const job = await jobs.dbStartJob({ ...data, status: JobStatus.RUNNING });
  rollingLog.push(rollingLogEntry('job started', job.id));

  await prisma.linkedJob.create({
    data: {
      id: uuidv7(),
      date_created: job.date_created,
      job_id: job.id,
      work_version_id: payload.work_version_id,
    },
    select: { id: true },
  });

  const workVersionPayload = workVersionToPayload(workVersionRow);
  if (workVersionPayload.metadata) {
    const signedMetadata = await signFilesInMetadata(
      workVersionPayload.metadata as Parameters<typeof signFilesInMetadata>[0],
      workVersionRow.cdn ?? '',
      ctx,
    );
    workVersionPayload.metadata = signedMetadata as WorkVersionMetadataPayload;
  }

  const pdfFile = getPdfFileFromMetadata(workVersionPayload.metadata, workVersionPayload.id);
  const signedUrl = pdfFile.signedUrl!;
  const filename = (
    pdfFile.name && !pdfFile.name.endsWith('.pdf')
      ? `${pdfFile.name}.pdf`
      : (pdfFile.name ?? pdfFile.path ?? 'manuscript.pdf')
  ) as string;

  const baseConfig =
    (ctx.$config.app?.extensions?.['checks-proofig'] as Record<string, unknown>) ?? {};
  const mergedConfig = await getProofigConfigWithOverrides(baseConfig, prisma);
  const maintenanceBlock = maintenanceGuardFromConfig(mergedConfig);
  if (maintenanceBlock) {
    await handleProofigSubmitJobFailure(
      job.id,
      payload.proofig_run_id,
      maintenanceBlock.error?.message ?? 'Image integrity is under maintenance',
      rollingLog,
    );
    return;
  }
  const apiBaseUrl =
    (mergedConfig.apiBaseUrl as string | undefined) ?? process.env.PROOFIG_API_BASE_URL;
  if (!apiBaseUrl?.trim()) {
    await handleProofigSubmitJobFailure(
      job.id,
      payload.proofig_run_id,
      'checks-proofig extension config missing apiBaseUrl; cannot run PROOFIG_SUBMIT_STREAM job',
      rollingLog,
    );
    return;
  }

  const notifyBaseUrlOverride =
    typeof mergedConfig.notifyBaseUrl === 'string' ? mergedConfig.notifyBaseUrl : undefined;
  const notifyBaseUrl = hooksNotifyBaseUrl('proofig/notify', notifyBaseUrlOverride);
  const notify_url = `${notifyBaseUrl}/${payload.proofig_run_id}`;

  const submitPayload = {
    submit_req_id: payload.proofig_run_id,
    notify_url,
    workVersion: workVersionPayload,
  };
  const submitParams = buildProofigSubmitParams(submitPayload, filename);

  const runningJob = await jobs.dbUpdateJob(job.id, {
    status: JobStatus.RUNNING,
    message: 'Streaming PDF to Proofig...',
    results: {
      rollingLog,
    },
  });
  rollingLog.push(rollingLogEntry('job marked RUNNING', runningJob.id));

  const submitStartedAt = new Date().toISOString();
  await patchProofigRunServiceData(payload.proofig_run_id, (serviceData) => {
    let next = serviceData ?? MINIMAL_PROOFIG_SERVICE_DATA;
    if (next.stages?.documentPreparation?.status === 'processing') {
      next = completeDocumentPreparation(next, submitStartedAt);
    }
    return startInitialPostProcessing(next, submitStartedAt);
  });

  async function fetchPdfForSubmit(): Promise<Response> {
    rollingLog.push(rollingLogEntry('downloading PDF via signedUrl', { signedUrl }));
    const r = await fetch(signedUrl);
    if (!r.ok) {
      throw new Error(`Failed to download PDF: ${r.status} ${r.statusText}`);
    }
    return r;
  }

  let token: string;
  try {
    rollingLog.push(
      rollingLogEntry('resolving Proofig token (cache or authenticate) before submit', {}),
    );
    token = await getProofingToken(apiBaseUrl, mergedConfig);
  } catch (err) {
    const errorMessage = getErrorMessage(err);
    console.error('[proofigSubmitStreamHandler] Failed to get Proofig token', err);
    const failedAuthJob = await handleProofigSubmitJobFailure(
      job.id,
      payload.proofig_run_id,
      errorMessage,
      rollingLog,
    );
    return failedAuthJob;
  }

  try {
    rollingLog.push(rollingLogEntry('submitting to Proofig via streaming HTTP POST', {}));

    const streamSubmit = (pdf: Response, bearer: string) =>
      postToProofigStream(apiBaseUrl, submitParams, pdf, filename, bearer);

    const submitWith401Retry = async (): Promise<
      Awaited<ReturnType<typeof postToProofigStream>>
    > => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const pdfResponse = await fetchPdfForSubmit();
        try {
          return await streamSubmit(pdfResponse, token);
        } catch (err) {
          const is401 = proofigSubmitErrorHasStatus(err, 401);
          if (!is401 || attempt > 0) throw err;
          rollingLog.push(
            rollingLogEntry(
              'Proofig submit returned 401; invalidating token cache and retrying once',
              {},
            ),
          );
          await invalidateProofingTokenCache(apiBaseUrl, mergedConfig);
          token = await getProofingToken(apiBaseUrl, mergedConfig);
        }
      }
      throw new Error('Proofig submit: retry loop exited without result');
    };

    const result = await submitWith401Retry();

    // Transition run stages: initialPost completed, subimageDetection pending
    const receivedAt = new Date().toISOString();
    await patchProofigRunServiceData(payload.proofig_run_id, (serviceData) =>
      completeInitialPostAndSetSubimageDetectionPending(
        serviceData ?? MINIMAL_PROOFIG_SERVICE_DATA,
        receivedAt,
      ),
    );
    const completed = await jobs.dbUpdateJob(job.id, {
      status: JobStatus.COMPLETED,
      message: 'Proofig submission accepted',
      results: {
        rollingLog,
        reportId: result.report_id,
        proofigStatus: result.status,
      },
    });

    return completed;
  } catch (err) {
    const message = getErrorMessage(err);
    console.error('[proofigSubmitStreamHandler] Proofig submit stream failed', err);
    rollingLog.push(rollingLogEntry('Proofig submit stream failed', { error: message }));
    const failedJob = await handleProofigSubmitJobFailure(
      job.id,
      payload.proofig_run_id,
      message,
      rollingLog,
    );
    return failedJob;
  }
}
