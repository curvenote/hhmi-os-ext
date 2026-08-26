import type { CreateJob } from '@curvenote/scms-core';
import { JobStatus } from '@curvenote/scms-db';
import { httpError } from '@curvenote/scms-core';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import {
  type Context,
  type StorageBackend,
  getPrismaClient,
  jobs,
  File,
} from '@curvenote/scms-server';
import type { TextIntegrityDataSchema } from '../../schema.js';
import { textIntegrityDataSchema } from '../../schema.js';
import { getTextIntegrityConfigWithOverrides } from '../config.server.js';
import { patchTextIntegrityRunServiceData } from '../checkRunColumns.server.js';
import { notifyTextIntegrityPdfPersistFailed } from '../slackNotify.server.js';
import { fetchSimilarityReportPdfFromRelay } from '../fetch-similarity-report-from-relay.server.js';
import { resolveRelayInstanceId } from '../relay-urls.server.js';
import { getAppChecksFromContext, resolveServiceName } from '../relay-config.server.js';
import {
  buildSimilarityReportFileEntry,
  shouldPersistSimilarityReport,
  similarityReportStoragePath,
} from '../similarity-report-storage.server.js';
import { writeSimilarityPdfToStorage } from '../write-similarity-pdf-to-storage.server.js';

export const TEXT_INTEGRITY_PERSIST_PDF = 'TEXT_INTEGRITY_PERSIST_PDF';

const TextIntegrityPersistPdfJobPayloadSchema = z.object({
  work_version_id: z.string().uuid('work_version_id is required'),
  check_service_run_id: z.string().min(1, 'check_service_run_id is required'),
});

export type TextIntegrityPersistPdfJobPayload = z.infer<
  typeof TextIntegrityPersistPdfJobPayloadSchema
>;

type CheckServiceRunData = {
  serviceData?: TextIntegrityDataSchema;
};

/**
 * Fetch similarity PDF from checks-relay and write to work version storage;
 * record file metadata on check run serviceData.
 */
export async function textIntegrityPersistPdfHandler(
  ctx: Context,
  data: CreateJob,
  storageBackend?: StorageBackend,
) {
  const parseResult = TextIntegrityPersistPdfJobPayloadSchema.safeParse(data.payload);
  if (!parseResult.success) {
    const msg = parseResult.error.issues.map((e) => e.message).join('; ');
    throw httpError(400, `Invalid TEXT_INTEGRITY_PERSIST_PDF payload: ${msg}`);
  }
  const payload = parseResult.data;

  if (!storageBackend) {
    throw httpError(500, 'TEXT_INTEGRITY_PERSIST_PDF requires a storage backend');
  }

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

  const job = await jobs.dbStartJob({ ...data, status: JobStatus.RUNNING });
  await jobs.dbUpdateJob(job.id, {
    status: JobStatus.RUNNING,
    message: 'Text integrity persist similarity PDF',
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

  const runData = run.data as CheckServiceRunData | null;
  const parsedSd = textIntegrityDataSchema.safeParse(runData?.serviceData);
  const serviceData = parsedSd.success ? parsedSd.data : undefined;
  if (!serviceData) {
    throw httpError(422, 'Check run has no valid text integrity serviceData');
  }

  if (!shouldPersistSimilarityReport(serviceData)) {
    const completed = await jobs.dbUpdateJob(job.id, {
      status: JobStatus.COMPLETED,
      message: 'Similarity PDF already stored for this report id',
      results: { skipped: true, check_service_run_id: payload.check_service_run_id },
    });
    return completed;
  }

  const pdfId = serviceData.reportPdfId ?? serviceData.latest?.reportPdfId;
  if (!pdfId) {
    throw httpError(400, 'No reportPdfId on check run; cannot persist PDF');
  }

  try {
    const baseExt =
      (ctx.$config?.app?.extensions?.['checks-text-integrity'] as Record<string, unknown>) ?? {};
    const mergedConfig = await getTextIntegrityConfigWithOverrides(baseExt, prisma);
    const checks = getAppChecksFromContext(ctx);
    const serviceName = resolveServiceName(mergedConfig);
    const relayInstanceId = resolveRelayInstanceId(mergedConfig);

    const { bytes } = await fetchSimilarityReportPdfFromRelay(
      checks ?? {},
      serviceName,
      relayInstanceId,
      serviceData,
    );

    const storagePath = similarityReportStoragePath(
      workVersion.cdn_key,
      payload.check_service_run_id,
    );

    const bucket = storageBackend.knownBucketFromCDN(workVersion.cdn);
    if (!bucket) {
      throw httpError(422, `Unknown CDN bucket for work version: ${workVersion.cdn}`);
    }

    const file = new File(storageBackend, storagePath, bucket);
    const { md5, size } = await writeSimilarityPdfToStorage(file, bytes);

    const uploadDate = new Date().toISOString();
    const fileEntry = buildSimilarityReportFileEntry(storagePath, size, md5, uploadDate);

    await patchTextIntegrityRunServiceData(payload.check_service_run_id, (sd) => {
      const nextFiles = { ...(sd.files ?? {}) };
      for (const key of Object.keys(nextFiles)) {
        if (nextFiles[key]?.slot === fileEntry.slot) {
          delete nextFiles[key];
        }
      }
      nextFiles[storagePath] = fileEntry;
      return {
        ...sd,
        files: nextFiles,
        similarityReportStored: true,
        storedReportPdfId: pdfId,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to persist similarity PDF';
    void notifyTextIntegrityPdfPersistFailed(ctx, payload.check_service_run_id, message);
    await jobs.dbUpdateJob(job.id, {
      status: JobStatus.FAILED,
      message,
    });
    throw err;
  }

  const completed = await jobs.dbUpdateJob(job.id, {
    status: JobStatus.COMPLETED,
    message: 'Similarity PDF stored on work version CDN',
    results: {
      check_service_run_id: payload.check_service_run_id,
      path: similarityReportStoragePath(workVersion.cdn_key, payload.check_service_run_id),
    },
  });

  return completed;
}
