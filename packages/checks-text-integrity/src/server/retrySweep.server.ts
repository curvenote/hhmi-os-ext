import {
  CronJobTargetAuth,
  CronJobTargetType,
  dbGetCronJob,
  dbSeedBuiltinCronJob,
  dbUpdateCronJob,
  getConfig,
  getPrismaClient,
  resolveScopedCronTargetUrl,
} from '@curvenote/scms-server';
import type { ExtensionCheckHandleActionArgs } from '@curvenote/scms-core';
import { getTextIntegrityConfigWithOverrides } from './config.server.js';
import {
  releaseTextIntegrityRunRetrySweepClaim,
  tryClaimTextIntegrityRunForRetrySweep,
} from './runSuperseded.server.js';
import { markCheckServiceRunNoAutoRetry } from './checkRunColumns.server.js';
import {
  getTextIntegrityAutoRetryConfig,
  isTextIntegrityRunAutoRetryEligible,
} from './autoRetryPolicy.server.js';
import { retryTextIntegrityCheckRun } from './retryCheckRun.server.js';

const TEXT_INTEGRITY_KIND = 'checks-text-integrity';
export const TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID = 'text-integrity-retry-sweep';
export const TEXT_INTEGRITY_RETRY_SWEEP_SCOPE = 'POST:/v1/hooks/text-integrity/retry-sweep';

type RetryChainRun = {
  id: string;
  retry_of_id: string | null;
  failed_at: string | null;
};

const emptySweepResult = (): TextIntegrityRetrySweepResult => ({
  scanned: 0,
  retried: 0,
  skippedClaimed: 0,
  skippedNotEligible: 0,
  skippedEula: 0,
  failed: 0,
  errors: [],
});

async function buildRootFailedAtCache(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  candidates: RetryChainRun[],
): Promise<Map<string, string | null>> {
  const runsById = new Map<string, RetryChainRun>();
  for (const candidate of candidates) {
    runsById.set(candidate.id, candidate);
  }

  const pendingIds = new Set<string>();
  for (const candidate of candidates) {
    let nextId: string | null | undefined = candidate.retry_of_id;
    const visited = new Set<string>();
    while (nextId) {
      if (visited.has(nextId)) break;
      visited.add(nextId);
      const known = runsById.get(nextId);
      if (known) {
        nextId = known.retry_of_id;
        continue;
      }
      pendingIds.add(nextId);
      break;
    }
  }

  while (pendingIds.size > 0) {
    const ids = [...pendingIds];
    pendingIds.clear();
    const rows: RetryChainRun[] = await prisma.checkServiceRun.findMany({
      where: { id: { in: ids } },
      select: { id: true, retry_of_id: true, failed_at: true },
    });
    for (const row of rows) {
      runsById.set(row.id, row);
      if (row.retry_of_id && !runsById.has(row.retry_of_id)) {
        pendingIds.add(row.retry_of_id);
      }
    }
  }

  const cache = new Map<string, string | null>();

  function resolveRootFailedAt(runId: string, visiting = new Set<string>()): string | null {
    if (cache.has(runId)) {
      return cache.get(runId) ?? null;
    }

    const run = runsById.get(runId);
    if (!run || visiting.has(runId)) {
      cache.set(runId, null);
      return null;
    }
    visiting.add(runId);

    if (!run.retry_of_id) {
      const rootFailedAt = run.failed_at ?? null;
      cache.set(runId, rootFailedAt);
      return rootFailedAt;
    }

    const parent = runsById.get(run.retry_of_id);
    if (!parent) {
      const rootFailedAt = run.failed_at ?? null;
      cache.set(runId, rootFailedAt);
      return rootFailedAt;
    }

    const rootFailedAt = resolveRootFailedAt(run.retry_of_id, visiting);
    cache.set(runId, rootFailedAt);
    return rootFailedAt;
  }

  for (const candidate of candidates) {
    resolveRootFailedAt(candidate.id);
  }

  return cache;
}

async function loadTextIntegrityAutoRetryConfig() {
  const config = await getConfig();
  const baseExt =
    (config.app?.extensions?.['checks-text-integrity'] as Record<string, unknown>) ?? {};
  const prisma = await getPrismaClient();
  const mergedConfig = await getTextIntegrityConfigWithOverrides(baseExt, prisma);
  return getTextIntegrityAutoRetryConfig(mergedConfig);
}

export type TextIntegrityRetrySweepCronJobSummary = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  targetUrl: string | null;
  targetScope: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  nextRunAt: string | null;
};

export type TextIntegrityRetrySweepCronStatus = {
  installed: boolean;
  cronJob?: TextIntegrityRetrySweepCronJobSummary;
};

function mapRetrySweepCronJob(
  job: NonNullable<Awaited<ReturnType<typeof dbGetCronJob>>>,
): TextIntegrityRetrySweepCronJobSummary {
  return {
    id: job.id,
    name: job.name,
    schedule: job.schedule,
    enabled: job.enabled,
    targetUrl: job.target_url,
    targetScope: job.target_scope,
    lastRunAt: job.last_run_at,
    lastStatus: job.last_status,
    nextRunAt: job.next_run_at,
  };
}

/** Whether the built-in Text Integrity retry sweep CronJob is registered. */
export async function getTextIntegrityRetrySweepCronStatus(): Promise<TextIntegrityRetrySweepCronStatus> {
  let job = await dbGetCronJob(TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID);
  if (!job) {
    return { installed: false };
  }

  const config = await getConfig();
  let expectedTargetUrl: string | undefined;
  try {
    expectedTargetUrl = resolveScopedCronTargetUrl(TEXT_INTEGRITY_RETRY_SWEEP_SCOPE, config.api);
  } catch {
    // Keep displaying stored values when config cannot resolve the scope yet.
  }
  if (expectedTargetUrl && job.target_url !== expectedTargetUrl) {
    job = await dbUpdateCronJob(TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID, {
      target_url: expectedTargetUrl,
    });
  }

  return { installed: true, cronJob: mapRetrySweepCronJob(job) };
}

async function buildRetrySweepCronSeedInput() {
  const config = await getConfig();
  const autoRetry = await loadTextIntegrityAutoRetryConfig();
  // Cron HTTP jobs run in the app process; resolve from api.url + target_scope (not tasksCallbackUrl).
  const targetUrl = resolveScopedCronTargetUrl(TEXT_INTEGRITY_RETRY_SWEEP_SCOPE, config.api);

  return {
    name: 'Text Integrity retry sweep',
    description:
      'Automatically retries eligible failed Text Integrity check runs (schedule in System → Cron).',
    schedule: '*/5 * * * *',
    timezone: 'UTC',
    enabled: autoRetry.enabled,
    target_type: CronJobTargetType.HTTP,
    target_url: targetUrl,
    http_method: 'POST',
    target_auth: CronJobTargetAuth.HANDSHAKE,
    target_scope: TEXT_INTEGRITY_RETRY_SWEEP_SCOPE,
    payload: {},
  } as const;
}

/** Idempotent seed for the built-in retry sweep CronJob (install via admin UI). */
export async function seedTextIntegrityRetrySweepCronJob(): Promise<void> {
  await dbSeedBuiltinCronJob(
    TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
    await buildRetrySweepCronSeedInput(),
  );
}

/** Admin install: create the CronJob row when missing; returns current status. */
export async function installTextIntegrityRetrySweepCronJob(): Promise<TextIntegrityRetrySweepCronStatus> {
  const seedInput = await buildRetrySweepCronSeedInput();
  const existing = await dbGetCronJob(TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID);
  if (!existing) {
    await dbSeedBuiltinCronJob(TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID, seedInput);
  } else {
    await dbUpdateCronJob(TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID, {
      target_url: seedInput.target_url,
      target_scope: seedInput.target_scope,
    });
  }
  return getTextIntegrityRetrySweepCronStatus();
}

export type TextIntegrityRetrySweepResult = {
  scanned: number;
  retried: number;
  skippedClaimed: number;
  skippedNotEligible: number;
  skippedEula: number;
  failed: number;
  errors: { runId: string; message: string }[];
};

function resolveServiceAccountUserId(config: Awaited<ReturnType<typeof getConfig>>): string {
  return config.api.submissionsServiceAccount?.id ?? 'system-cron';
}

async function buildRetrySweepContext(): Promise<
  NonNullable<ExtensionCheckHandleActionArgs['ctx']>
> {
  const config = await getConfig();
  return {
    $config: config as Record<string, unknown>,
    user: { id: resolveServiceAccountUserId(config) },
  } as NonNullable<ExtensionCheckHandleActionArgs['ctx']>;
}

/** Find failed, non-superseded runs eligible for automated retry and invoke domain retry flow. */
export async function runTextIntegrityRetrySweep(options?: {
  limit?: number;
}): Promise<TextIntegrityRetrySweepResult> {
  const autoRetry = await loadTextIntegrityAutoRetryConfig();
  if (!autoRetry.enabled) {
    return emptySweepResult();
  }

  const prisma = await getPrismaClient();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const queryLimit = Math.max(1, options?.limit ?? autoRetry.sweep.limit);

  const candidates = await prisma.checkServiceRun.findMany({
    where: {
      kind: TEXT_INTEGRITY_KIND,
      status: 'error',
      retried: false,
      no_auto_retry: false,
      attempt: { lt: autoRetry.limits.maxAttempts },
      failed_at: { not: null, lte: nowIso },
    },
    orderBy: { failed_at: 'asc' },
    take: queryLimit,
    select: {
      id: true,
      work_version_id: true,
      attempt: true,
      failed_at: true,
      retry_of_id: true,
      data: true,
    },
  });

  const ctx = await buildRetrySweepContext();
  const rootFailedAtCache = await buildRootFailedAtCache(prisma, candidates);
  const result: TextIntegrityRetrySweepResult = {
    scanned: candidates.length,
    retried: 0,
    skippedClaimed: 0,
    skippedNotEligible: 0,
    skippedEula: 0,
    failed: 0,
    errors: [],
  };

  for (const sourceRun of candidates) {
    const rootFailedAt = rootFailedAtCache.get(sourceRun.id) ?? null;
    if (!isTextIntegrityRunAutoRetryEligible(sourceRun, rootFailedAt, autoRetry, nowMs)) {
      result.skippedNotEligible += 1;
      continue;
    }

    const claimed = await tryClaimTextIntegrityRunForRetrySweep(sourceRun.id);
    if (!claimed) {
      result.skippedClaimed += 1;
      continue;
    }

    const outcome = await retryTextIntegrityCheckRun(
      ctx,
      sourceRun.work_version_id,
      sourceRun.id,
      'admin',
      { suppressSlack: true },
    );

    if ('success' in outcome && outcome.success) {
      result.retried += 1;
      continue;
    }

    if ((outcome as { markSupersededFailed?: boolean }).markSupersededFailed) {
      result.failed += 1;
      result.errors.push({
        runId: sourceRun.id,
        message: outcome.error?.message ?? 'Mark superseded failed',
      });
      continue;
    }

    if ((outcome as { eulaSkip?: boolean }).eulaSkip) {
      await markCheckServiceRunNoAutoRetry(sourceRun.id);
      await releaseTextIntegrityRunRetrySweepClaim(sourceRun.id);
      result.skippedEula += 1;
      continue;
    }

    await releaseTextIntegrityRunRetrySweepClaim(sourceRun.id);
    result.failed += 1;
    result.errors.push({
      runId: sourceRun.id,
      message: outcome.error?.message ?? 'Retry failed',
    });
  }

  return result;
}
