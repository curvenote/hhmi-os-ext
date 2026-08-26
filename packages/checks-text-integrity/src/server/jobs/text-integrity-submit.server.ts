import type { CreateJob } from '@curvenote/scms-core';
import type { Context } from '@curvenote/scms-server';
import { JobStatus } from '@curvenote/scms-db';
import {
  httpError,
  coerceToObject,
  WORK_VERSION_DOCX_MIME,
  maintenanceGuardFromConfig,
} from '@curvenote/scms-core';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import {
  getPrismaClient,
  hooksNotifyBaseUrl,
  jobs,
  signFilesInMetadata,
} from '@curvenote/scms-server';
import {
  startSubmission,
  markSubmissionError as markSubmissionErrorSM,
} from '../stateMachine.server.js';
import {
  getTextIntegrityConfigWithOverrides,
  type TextIntegrityServiceSettings,
} from '../config.server.js';
import { buildRelayContextEnvelope } from '../relay-context.server.js';
import { checksRelayUploadUrl, resolveRelayInstanceId } from '../relay-urls.server.js';
import {
  patchTextIntegrityRunServiceData,
  markCheckServiceRunNoAutoRetry,
} from '../checkRunColumns.server.js';
import {
  assertOriginalSubmitterEulaCurrent,
  buildUploadEulaMetadata,
  isEulaRequired,
  isRelayEulaNotAccepted,
  refreshEulaCacheIfStale,
  resolveEulaSubmitFailureMessage,
} from '../eula.server.js';

/** Job type for Text Integrity submit via checks-relay. */
export const TEXT_INTEGRITY_SUBMIT = 'TEXT_INTEGRITY_SUBMIT';

const TextIntegritySubmitJobPayloadSchema = z.object({
  work_version_id: z.string().uuid('work_version_id is required'),
  check_service_run_id: z.string().min(1, 'check_service_run_id is required'),
});

export type TextIntegritySubmitJobPayload = z.infer<typeof TextIntegritySubmitJobPayloadSchema>;

type AppChecksConfig = {
  relayBaseUrl?: string;
  relayApiKey?: string;
};

const RELAY_SUBMIT_TIMEOUT_MS = 300_000;
const RELAY_CONTEXT_MAX_BYTES = 64 * 1024;

type ManuscriptFile = { url: string; filename: string; role: string };

type MetadataWithFiles = {
  files?: Record<string, { signedUrl?: string; name?: string; path?: string; type?: string }>;
};

function getAppChecks(ctx: Context): AppChecksConfig | undefined {
  const app = ctx.$config?.app as { checks?: AppChecksConfig } | undefined;
  return app?.checks;
}

function resolveServiceName(merged: Record<string, unknown>): string {
  const fromExt = merged.serviceName;
  if (typeof fromExt === 'string' && fromExt.trim() !== '') return fromExt.trim();
  return 'echo';
}

function pickManuscriptFromSignedMetadata(
  metadata: MetadataWithFiles | null,
  workVersionId: string,
): ManuscriptFile {
  const files = metadata?.files;
  if (!files || typeof files !== 'object') {
    throw httpError(422, `Work version ${workVersionId} has no metadata.files`);
  }
  const entries = Object.values(files);
  let pdf: (typeof entries)[0] | undefined;
  let docx: (typeof entries)[0] | undefined;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const type = entry.type?.toLowerCase?.();
    const name = (entry.name ?? entry.path ?? '').toLowerCase();
    const isPdf = type === 'application/pdf' || name.endsWith('.pdf') || name === 'pdf';
    const isDocx = type === WORK_VERSION_DOCX_MIME || name.endsWith('.docx');
    if (isPdf && !pdf) pdf = entry;
    if (isDocx && !docx) docx = entry;
  }
  const chosen = pdf ?? docx;
  if (!chosen?.signedUrl) {
    throw httpError(
      422,
      `Work version ${workVersionId} has no PDF or DOCX with a signedUrl; cannot submit to relay`,
    );
  }
  let filename = (chosen.name ?? chosen.path ?? '').trim();
  if (!filename) {
    filename = pdf ? 'manuscript.pdf' : 'manuscript.docx';
  } else if (pdf && !filename.toLowerCase().endsWith('.pdf')) {
    filename = `${filename}.pdf`;
  } else if (!pdf && docx && !filename.toLowerCase().endsWith('.docx')) {
    filename = `${filename}.docx`;
  }
  return { url: chosen.signedUrl, filename, role: 'manuscript' };
}

type RelaySubmitResponse = {
  status?: string;
  message?: string;
  error?: string;
  result?: {
    externalId?: string;
    submissionId?: string;
    externalRef?: string;
    error?: string;
    statusCode?: number;
    code?: string;
  };
};

function relaySubmitErrorDetail(relayJson: RelaySubmitResponse, httpStatus: number): string {
  return (
    relayJson.message ??
    relayJson.error ??
    (typeof relayJson.result === 'object' && relayJson.result && 'error' in relayJson.result
      ? String((relayJson.result as { error?: string }).error)
      : null) ??
    `checks-relay upload failed (HTTP ${httpStatus})`
  );
}

async function readRelaySubmitResponse(res: Response): Promise<RelaySubmitResponse> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as RelaySubmitResponse;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

/**
 * TEXT_INTEGRITY_SUBMIT: sign manuscript URLs, POST checks-relay upload, update check run with provider externalId.
 */
export async function textIntegritySubmitHandler(
  ctx: Context,
  data: CreateJob,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _storageBackend?: unknown,
) {
  const parseResult = TextIntegritySubmitJobPayloadSchema.safeParse(data.payload);
  if (!parseResult.success) {
    const msg = parseResult.error.issues.map((e: { message: string }) => e.message).join('; ');
    throw httpError(400, `Invalid TEXT_INTEGRITY_SUBMIT payload: ${msg}`);
  }
  const payload = parseResult.data;

  const prisma = await getPrismaClient();
  const [workVersionRow, checkRunRow] = await Promise.all([
    prisma.workVersion.findUnique({
      where: { id: payload.work_version_id },
    }),
    prisma.checkServiceRun.findUnique({
      where: { id: payload.check_service_run_id },
      select: { created_by_id: true },
    }),
  ]);
  if (!workVersionRow) {
    throw httpError(404, `Work version ${payload.work_version_id} not found`);
  }

  const submitterId = checkRunRow?.created_by_id ?? ctx.user?.id ?? data.invoked_by_id ?? undefined;
  let submitterUser: { id: string; email: string | null; display_name: string | null } | undefined;
  if (submitterId) {
    const row = await prisma.user.findUnique({
      where: { id: submitterId },
      select: { id: true, email: true, display_name: true },
    });
    if (row) submitterUser = row;
  }

  const job = await jobs.dbStartJob({ ...data, status: JobStatus.RUNNING });
  await jobs.dbUpdateJob(job.id, {
    status: JobStatus.RUNNING,
    message: 'Text integrity submit',
  });

  await prisma.linkedJob.create({
    data: {
      id: uuidv7(),
      date_created: job.date_created,
      job_id: job.id,
      work_version_id: payload.work_version_id,
    },
    select: { id: true },
  });

  const markRunError = async (message: string) => {
    await patchTextIntegrityRunServiceData(payload.check_service_run_id, (serviceData) =>
      markSubmissionErrorSM(serviceData, message),
    );
  };

  try {
    const baseExt =
      (ctx.$config?.app?.extensions?.['checks-text-integrity'] as Record<string, unknown>) ?? {};
    const mergedConfig = await getTextIntegrityConfigWithOverrides(baseExt, prisma);
    const maintenanceBlock = maintenanceGuardFromConfig(mergedConfig);
    if (maintenanceBlock) {
      throw httpError(
        maintenanceBlock.status ?? 503,
        maintenanceBlock.error?.message ?? 'Text integrity is under maintenance',
      );
    }
    const checks = getAppChecks(ctx);

    const relayBaseUrl = (checks?.relayBaseUrl ?? '').trim().replace(/\/$/, '');
    const relayApiKey = (checks?.relayApiKey ?? '').trim();

    if (!relayBaseUrl) {
      throw httpError(
        503,
        'app.checks.relayBaseUrl is not configured; cannot submit to checks-relay',
      );
    }
    if (!relayApiKey) {
      throw httpError(
        503,
        'app.checks.relayApiKey is not configured; cannot submit to checks-relay',
      );
    }

    const eulaCheck = await assertOriginalSubmitterEulaCurrent(ctx, submitterId);
    if (!eulaCheck.ok) {
      await markCheckServiceRunNoAutoRetry(payload.check_service_run_id);
      throw httpError(400, eulaCheck.message);
    }

    const cachedEula = await refreshEulaCacheIfStale(ctx, mergedConfig);
    const submitterData = submitterUser
      ? (
          await prisma.user.findUnique({
            where: { id: submitterUser.id },
            select: { data: true },
          })
        )?.data
      : undefined;
    const eulaPayload = buildUploadEulaMetadata(submitterData, cachedEula);
    const requireEula = isEulaRequired(mergedConfig);

    const serviceName = resolveServiceName(mergedConfig);
    const relayInstanceId = resolveRelayInstanceId(mergedConfig);
    const metadataRoot =
      workVersionRow.metadata != null ? coerceToObject(workVersionRow.metadata) : null;
    if (!metadataRoot || typeof metadataRoot !== 'object') {
      throw httpError(422, `Work version ${payload.work_version_id} has no metadata`);
    }

    const signedMetadata = await signFilesInMetadata(
      metadataRoot as Parameters<typeof signFilesInMetadata>[0],
      workVersionRow.cdn ?? '',
      ctx,
    );

    const manuscript = pickManuscriptFromSignedMetadata(
      signedMetadata as MetadataWithFiles,
      payload.work_version_id,
    );

    const notifyBaseUrlOverride =
      typeof mergedConfig.notifyBaseUrl === 'string' ? mergedConfig.notifyBaseUrl : undefined;
    const notifyBase = hooksNotifyBaseUrl('text-integrity/notify', notifyBaseUrlOverride);
    const notifyUrl = `${notifyBase}/${payload.check_service_run_id}`;

    const submitUrl = checksRelayUploadUrl(relayBaseUrl, serviceName, relayInstanceId);
    const userIdentity = submitterUser
      ? {
          id: submitterUser.id,
          given_name: submitterUser.display_name ?? 'Unknown',
          family_name: '',
          email: submitterUser.email ?? '',
        }
      : undefined;
    const body = {
      client_id: payload.check_service_run_id,
      notify_url: notifyUrl,
      files: [{ url: manuscript.url, filename: manuscript.filename }],
      metadata: {
        title: workVersionRow.title,
        ...(userIdentity ? { submitter: userIdentity } : {}),
        relayContext: buildRelayContextEnvelope(
          mergedConfig.settings as TextIntegrityServiceSettings,
        ),
        ...(requireEula ? { require_eula: true } : {}),
        ...(eulaPayload ? { eula: eulaPayload } : {}),
      },
    };

    const relayContextBytes = Buffer.byteLength(
      JSON.stringify((body.metadata as Record<string, unknown>).relayContext ?? {}),
      'utf8',
    );
    if (relayContextBytes > RELAY_CONTEXT_MAX_BYTES) {
      throw httpError(
        400,
        `Text Integrity relay context exceeds ${RELAY_CONTEXT_MAX_BYTES} bytes; reduce configured options payload size`,
      );
    }

    const res = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${relayApiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RELAY_SUBMIT_TIMEOUT_MS),
    });

    const relayJson = await readRelaySubmitResponse(res);

    if (!res.ok || relayJson.status === 'error') {
      const detail = relaySubmitErrorDetail(relayJson, res.status);
      if (
        isRelayEulaNotAccepted({
          httpStatus: res.status,
          result: relayJson.result,
        })
      ) {
        await markCheckServiceRunNoAutoRetry(payload.check_service_run_id);
        const userMessage = await resolveEulaSubmitFailureMessage(ctx, mergedConfig, detail);
        throw httpError(400, userMessage);
      }
      throw httpError(res.status >= 400 && res.status < 600 ? res.status : 502, detail);
    }

    const externalIdRaw =
      relayJson.result?.externalId ??
      relayJson.result?.externalRef ??
      relayJson.result?.submissionId;
    if (!externalIdRaw || typeof externalIdRaw !== 'string') {
      throw httpError(
        502,
        'checks-relay upload succeeded but response did not include result.externalId',
      );
    }

    await patchTextIntegrityRunServiceData(payload.check_service_run_id, (serviceData) => ({
      ...startSubmission(serviceData),
      externalId: externalIdRaw,
      externalRef: externalIdRaw,
      submissionId: externalIdRaw,
    }));
  } catch (err) {
    let message = 'Text integrity submit failed';
    if (err instanceof Response) {
      try {
        const j = (await err.clone().json()) as { message?: string };
        if (typeof j.message === 'string' && j.message) message = j.message;
      } catch {
        message = err.statusText || message;
      }
    } else if (err instanceof Error) {
      message = err.message;
    }
    await markRunError(message);
    throw err;
  }

  const completed = await jobs.dbUpdateJob(job.id, {
    status: JobStatus.COMPLETED,
    message: 'Text integrity submit complete',
    results: {
      message: 'Submit complete',
      check_service_run_id: payload.check_service_run_id,
    },
  });

  return completed;
}
