import type { Prisma } from '@curvenote/scms-db';
import { httpError } from '@curvenote/scms-core';
import { getPrismaClient } from '@curvenote/scms-server';
import { canShowResults, hasPipelineError } from '../serviceDataSchemas.js';
import type { TextIntegrityDataSchema } from '../schema.js';
import { textIntegrityDataSchema } from '../schema.js';
import { notifyTextIntegrityErrorTransition } from './slackNotify.server.js';

export type CheckRunCoarseStatus = 'healthy' | 'error' | 'unknown';

export type CheckRunColumnPatch = {
  status?: CheckRunCoarseStatus | null;
  failed_at?: string | null;
  attempt?: number;
  retried?: boolean;
  retried_at?: string | null;
  retry_of_id?: string | null;
  successor_id?: string | null;
  no_auto_retry?: boolean;
};

export type CheckRunRowForReader = {
  kind: string;
  status?: string | null;
  data?: unknown;
};

const OCC_RETRY_DELAY_MS = 50;

export function checkRunCoarseStatus(status: string | null | undefined): CheckRunCoarseStatus {
  if (status === 'healthy' || status === 'error' || status === 'unknown') return status;
  return 'unknown';
}

export function resolveTextIntegrityCoarseStatus(
  serviceData: TextIntegrityDataSchema | undefined,
): CheckRunCoarseStatus {
  if (!serviceData) return 'healthy';
  if (hasPipelineError(serviceData)) return 'error';
  if (canShowResults(serviceData) && !serviceData.summaryReport) return 'error';
  return 'healthy';
}

export function errorColumnPatch(failedAt = new Date().toISOString()): CheckRunColumnPatch {
  return { status: 'error', failed_at: failedAt };
}

export function healthyColumnPatch(): CheckRunColumnPatch {
  return { status: 'healthy', failed_at: null };
}

/** Exclude this run from platform cron / auto-retry sweeps (idempotent; manual retry unaffected). */
export async function markCheckServiceRunNoAutoRetry(checkServiceRunId: string): Promise<void> {
  const prisma = await getPrismaClient();
  const timestamp = new Date().toISOString();
  await prisma.checkServiceRun.updateMany({
    where: { id: checkServiceRunId, no_auto_retry: false },
    data: { no_auto_retry: true, date_modified: timestamp },
  });
}

export function columnsForTextIntegrityServiceData(
  serviceData: TextIntegrityDataSchema | undefined,
  failedAt = new Date().toISOString(),
): CheckRunColumnPatch {
  return resolveTextIntegrityCoarseStatus(serviceData) === 'error'
    ? errorColumnPatch(failedAt)
    : healthyColumnPatch();
}

function readServiceData(runData: unknown): TextIntegrityDataSchema | undefined {
  if (runData == null || typeof runData !== 'object') return undefined;
  const raw = (runData as Record<string, unknown>).serviceData;
  const parsed = textIntegrityDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Best-effort failure timestamp for reconcile backfill. */
export function deriveTextIntegrityFailedAt(run: {
  data?: unknown;
  date_modified?: string;
}): string {
  const serviceData = readServiceData(run.data);
  if (serviceData?.stages) {
    for (const stage of [serviceData.stages.processing, serviceData.stages.submission]) {
      if (stage?.status === 'error' && stage.timestamp?.trim()) {
        return stage.timestamp.trim();
      }
    }
  }
  return run.date_modified ?? new Date().toISOString();
}

export async function safeCheckServiceRunPatch<T extends Prisma.JsonObject>(
  checkServiceRunId: string,
  modifyFn: (data?: Prisma.JsonValue) => T | null,
  columns?: CheckRunColumnPatch,
  maxRetries = 5,
): Promise<Prisma.CheckServiceRunGetPayload<Record<string, never>>> {
  const prisma = await getPrismaClient();
  let retries = 0;

  while (retries < maxRetries) {
    const current = await prisma.checkServiceRun.findUnique({ where: { id: checkServiceRunId } });
    if (!current) {
      throw httpError(404, 'CheckServiceRun not found');
    }

    const newData = modifyFn(current.data);
    if (!newData && !columns) {
      return current;
    }

    try {
      const timestamp = new Date().toISOString();
      return await prisma.checkServiceRun.update({
        where: { id: checkServiceRunId, occ: current.occ },
        data: {
          ...(newData ? { data: newData } : {}),
          ...(columns ?? {}),
          date_modified: timestamp,
          occ: { increment: 1 },
        },
      });
    } catch {
      retries += 1;
      if (retries >= maxRetries) {
        throw httpError(409, 'CheckServiceRun OCC conflict');
      }
      await new Promise((resolve) => setTimeout(resolve, OCC_RETRY_DELAY_MS * retries));
    }
  }

  throw httpError(409, 'CheckServiceRun OCC conflict');
}

type RunDataWithoutStatus = Omit<Record<string, unknown>, 'status'>;

export function stripLegacyRunDataStatus(data: Prisma.JsonValue | undefined): RunDataWithoutStatus {
  const current = (data ?? {}) as Record<string, unknown>;
  const { status: _legacyStatus, ...rest } = current;
  return rest;
}

export async function patchTextIntegrityRunServiceData(
  checkServiceRunId: string,
  modifyServiceData: (
    current: TextIntegrityDataSchema,
  ) => TextIntegrityDataSchema | null | undefined,
  failedAt = new Date().toISOString(),
  maxRetries = 5,
): Promise<Prisma.CheckServiceRunGetPayload<Record<string, never>>> {
  const prisma = await getPrismaClient();
  let retries = 0;

  while (retries < maxRetries) {
    const current = await prisma.checkServiceRun.findUnique({ where: { id: checkServiceRunId } });
    if (!current) {
      throw httpError(404, 'CheckServiceRun not found');
    }

    const rest = stripLegacyRunDataStatus(current.data);
    const parsed = textIntegrityDataSchema.safeParse(rest.serviceData);
    const base = parsed.success ? parsed.data : textIntegrityDataSchema.parse({});
    const nextServiceData = modifyServiceData(base);
    if (nextServiceData == null) {
      return current;
    }

    const columns = columnsForTextIntegrityServiceData(nextServiceData, failedAt);
    const newData = {
      ...rest,
      serviceDataSchema: (rest.serviceDataSchema as Record<string, unknown>) ?? {},
      serviceData: nextServiceData,
    } as Prisma.JsonObject;

    try {
      const timestamp = new Date().toISOString();
      const beforeStatus = checkRunCoarseStatus(current.status);
      const updated = await prisma.checkServiceRun.update({
        where: { id: checkServiceRunId, occ: current.occ },
        data: {
          data: newData,
          ...columns,
          date_modified: timestamp,
          occ: { increment: 1 },
        },
      });
      void notifyTextIntegrityErrorTransition(checkServiceRunId, beforeStatus, nextServiceData);
      return updated;
    } catch {
      retries += 1;
      if (retries >= maxRetries) {
        throw httpError(409, 'CheckServiceRun OCC conflict');
      }
      await new Promise((resolve) => setTimeout(resolve, OCC_RETRY_DELAY_MS * retries));
    }
  }

  throw httpError(409, 'CheckServiceRun OCC conflict');
}
