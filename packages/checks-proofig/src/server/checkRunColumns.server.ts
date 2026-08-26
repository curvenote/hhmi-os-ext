import type { Prisma } from '@curvenote/scms-db';
import { httpError } from '@curvenote/scms-core';
import { getPrismaClient } from '@curvenote/scms-server';
import { hasError, proofigDataSchema, type ProofigDataSchema } from '../schema.js';
import { notifyProofigErrorTransition } from './slackNotify.server.js';
import { trackProofigTerminalTransition } from './analytics.server.js';

export type PatchProofigRunServiceDataOptions = {
  trackTerminalAnalytics?: boolean;
  request?: Request;
};

export type CheckRunCoarseStatus = 'healthy' | 'error' | 'unknown';

export type CheckRunColumnPatch = {
  status?: CheckRunCoarseStatus | null;
  failed_at?: string | null;
  attempt?: number;
  retried?: boolean;
  retried_at?: string | null;
  retry_of_id?: string | null;
  successor_id?: string | null;
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

export function resolveProofigCoarseStatus(
  serviceData: ProofigDataSchema | undefined,
): CheckRunCoarseStatus {
  return hasError(serviceData) ? 'error' : 'healthy';
}

export function errorColumnPatch(failedAt = new Date().toISOString()): CheckRunColumnPatch {
  return { status: 'error', failed_at: failedAt };
}

export function healthyColumnPatch(): CheckRunColumnPatch {
  return { status: 'healthy', failed_at: null };
}

export function columnsForProofigServiceData(
  serviceData: ProofigDataSchema | undefined,
  failedAt = new Date().toISOString(),
): CheckRunColumnPatch {
  return resolveProofigCoarseStatus(serviceData) === 'error'
    ? errorColumnPatch(failedAt)
    : healthyColumnPatch();
}

function readServiceData(runData: unknown): ProofigDataSchema | undefined {
  if (runData == null || typeof runData !== 'object') return undefined;
  const raw = (runData as Record<string, unknown>).serviceData;
  const parsed = proofigDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Best-effort failure timestamp for reconcile backfill. */
export function deriveProofigFailedAt(run: { data?: unknown; date_modified?: string }): string {
  const serviceData = readServiceData(run.data);
  if (serviceData?.stages) {
    for (const stage of Object.values(serviceData.stages)) {
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

export function stripLegacyRunDataStatus(
  data: Prisma.JsonValue | undefined,
): Record<string, unknown> {
  const current = (data ?? {}) as Record<string, unknown>;
  const { status: _legacyStatus, ...rest } = current;
  return rest;
}

export async function patchProofigRunServiceData(
  checkServiceRunId: string,
  modifyServiceData: (current: ProofigDataSchema) => ProofigDataSchema | null | undefined,
  failedAt = new Date().toISOString(),
  maxRetries = 5,
  options?: PatchProofigRunServiceDataOptions,
): Promise<Prisma.CheckServiceRunGetPayload<Record<string, never>>> {
  const prisma = await getPrismaClient();
  let retries = 0;

  while (retries < maxRetries) {
    const current = await prisma.checkServiceRun.findUnique({ where: { id: checkServiceRunId } });
    if (!current) {
      throw httpError(404, 'CheckServiceRun not found');
    }

    const rest = stripLegacyRunDataStatus(current.data);
    const parsed = proofigDataSchema.safeParse(rest.serviceData);
    const base = parsed.success ? parsed.data : proofigDataSchema.parse({});
    const nextServiceData = modifyServiceData(base);
    if (nextServiceData == null) {
      return current;
    }

    const columns = columnsForProofigServiceData(nextServiceData, failedAt);
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
      void notifyProofigErrorTransition(checkServiceRunId, beforeStatus, nextServiceData);
      if (options?.trackTerminalAnalytics) {
        void trackProofigTerminalTransition(
          {
            id: current.id,
            kind: current.kind,
            work_version_id: current.work_version_id,
            created_by_id: current.created_by_id,
            attempt: current.attempt,
            retry_of_id: current.retry_of_id,
            date_created: current.date_created,
          },
          base,
          nextServiceData,
          undefined,
          options.request,
        );
      }
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
