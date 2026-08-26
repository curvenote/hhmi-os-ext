import { getPrismaClient } from '@curvenote/scms-server';

const TEXT_INTEGRITY_KIND = 'checks-text-integrity';

/** After this many sweep mark-superseded failures, stop auto-retry for the source run. */
export const TEXT_INTEGRITY_MAX_SWEEP_MARK_SUPERSEDED_FAILURES = 3;

type RunRow = {
  retried?: boolean | null;
  successor_id?: string | null;
};

type SweepMeta = {
  markSupersededFailures?: number;
  markSupersededBackoffAt?: string;
};

function readSweepMeta(data: unknown): SweepMeta {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return {};
  const sweepMeta = (data as Record<string, unknown>).sweepMeta;
  if (sweepMeta == null || typeof sweepMeta !== 'object' || Array.isArray(sweepMeta)) return {};
  const meta = sweepMeta as SweepMeta;
  const failures = meta.markSupersededFailures;
  const backoffAt = meta.markSupersededBackoffAt;
  return {
    markSupersededFailures:
      typeof failures === 'number' && failures >= 0 ? Math.floor(failures) : undefined,
    markSupersededBackoffAt:
      typeof backoffAt === 'string' && backoffAt.trim() ? backoffAt.trim() : undefined,
  };
}

/** Sweep-only backoff anchor after a failed mark-superseded (does not move failed_at). */
export function readTextIntegritySweepMarkSupersededBackoffAt(data: unknown): string | null {
  return readSweepMeta(data).markSupersededBackoffAt ?? null;
}

/** True when a failed run was already retried and should leave the admin failed-runs list. */
export function isTextIntegrityRunSupersededByRetry(run: RunRow): boolean {
  return run.retried === true || Boolean(run.successor_id?.trim());
}

/**
 * Atomically claim a failed run for automated sweep retry.
 * Uses retried_at as a short-lived claim marker (cleared on failure via release).
 */
export async function tryClaimTextIntegrityRunForRetrySweep(sourceRunId: string): Promise<boolean> {
  const claimedAt = new Date().toISOString();
  const prisma = await getPrismaClient();
  const result = await prisma.checkServiceRun.updateMany({
    where: {
      id: sourceRunId,
      kind: TEXT_INTEGRITY_KIND,
      status: 'error',
      retried: false,
      successor_id: null,
      retried_at: null,
    },
    data: {
      retried_at: claimedAt,
      date_modified: claimedAt,
    },
  });
  return result.count === 1;
}

/** Release a sweep claim when retry did not complete (failure, skip, or error). */
export async function releaseTextIntegrityRunRetrySweepClaim(sourceRunId: string): Promise<void> {
  const prisma = await getPrismaClient();
  await prisma.checkServiceRun.updateMany({
    where: {
      id: sourceRunId,
      kind: TEXT_INTEGRITY_KIND,
      retried: false,
      successor_id: null,
    },
    data: {
      retried_at: null,
      date_modified: new Date().toISOString(),
    },
  });
}

/** Latest retry child for a source run, when mark-superseded failed after the child was created. */
export async function findExistingTextIntegrityRetrySuccessorId(
  sourceRunId: string,
): Promise<string | null> {
  const prisma = await getPrismaClient();
  const row = await prisma.checkServiceRun.findFirst({
    where: {
      kind: TEXT_INTEGRITY_KIND,
      retry_of_id: sourceRunId,
    },
    orderBy: { date_created: 'desc' },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Record a failed mark-superseded during sweep retry: track failures and a sweep-only backoff anchor.
 * Returns the updated failure count.
 */
export async function recordTextIntegritySweepMarkSupersededFailure(
  sourceRunId: string,
): Promise<number> {
  const prisma = await getPrismaClient();
  const run = await prisma.checkServiceRun.findUnique({
    where: { id: sourceRunId },
    select: { data: true },
  });
  const data =
    run?.data != null && typeof run.data === 'object' && !Array.isArray(run.data)
      ? (run.data as Record<string, unknown>)
      : {};
  const meta = readSweepMeta(data);
  const markSupersededFailures = (meta.markSupersededFailures ?? 0) + 1;
  const timestamp = new Date().toISOString();
  await prisma.checkServiceRun.update({
    where: { id: sourceRunId },
    data: {
      date_modified: timestamp,
      data: {
        ...data,
        sweepMeta: {
          ...meta,
          markSupersededFailures,
          markSupersededBackoffAt: timestamp,
        },
      },
    },
  });
  return markSupersededFailures;
}

export async function markTextIntegritySourceRunSupersededByRetry(
  sourceRunId: string,
  supersededByRunId: string,
  _supersededByUserId: string | undefined,
): Promise<void> {
  const retriedAt = new Date().toISOString();
  const prisma = await getPrismaClient();
  await prisma.checkServiceRun.update({
    where: { id: sourceRunId },
    data: {
      retried: true,
      retried_at: retriedAt,
      successor_id: supersededByRunId,
      date_modified: retriedAt,
    },
  });
}
