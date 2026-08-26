import {
  CronJobTargetAuth,
  CronJobTargetType,
  dbGetCronJob,
  dbSeedBuiltinCronJob,
  dbUpdateCronJob,
  getConfig,
  resolveScopedCronTargetUrl,
} from '@curvenote/scms-server';

/** Built-in CronJob id (System → Cron). */
export const TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID = 'text-integrity-eula-cache-refresh';

/** Endpoint scope for scoped handshake auth ({METHOD}:{path}). */
export const TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCOPE =
  'POST:/v1/hooks/text-integrity/eula-cache/refresh';

/** Default schedule: every 12 hours (EULA cache TTL is 24 hours). */
export const TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCHEDULE = '0 */12 * * *';

export type TextIntegrityEulaCacheRefreshCronJobSummary = {
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

export type TextIntegrityEulaCacheRefreshCronStatus = {
  installed: boolean;
  cronJob?: TextIntegrityEulaCacheRefreshCronJobSummary;
};

function mapEulaCacheRefreshCronJob(
  job: NonNullable<Awaited<ReturnType<typeof dbGetCronJob>>>,
): TextIntegrityEulaCacheRefreshCronJobSummary {
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

async function buildEulaCacheRefreshCronSeedInput() {
  const config = await getConfig();
  const targetUrl = resolveScopedCronTargetUrl(TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCOPE, config.api);

  return {
    name: 'Text Integrity EULA cache refresh',
    description:
      'Refreshes cached Turnitin EULA terms via checks-relay (schedule in System → Cron).',
    schedule: TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCHEDULE,
    timezone: 'UTC',
    enabled: true,
    target_type: CronJobTargetType.HTTP,
    target_url: targetUrl,
    http_method: 'POST',
    target_auth: CronJobTargetAuth.HANDSHAKE,
    target_scope: TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCOPE,
    payload: {},
  } as const;
}

export async function getTextIntegrityEulaCacheRefreshCronStatus(): Promise<TextIntegrityEulaCacheRefreshCronStatus> {
  let job = await dbGetCronJob(TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID);
  if (!job) {
    return { installed: false };
  }

  const config = await getConfig();
  let expectedTargetUrl: string | undefined;
  try {
    expectedTargetUrl = resolveScopedCronTargetUrl(
      TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCOPE,
      config.api,
    );
  } catch {
    // Keep displaying stored values when config cannot resolve the scope yet.
  }
  if (expectedTargetUrl && job.target_url !== expectedTargetUrl) {
    job = await dbUpdateCronJob(TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID, {
      target_url: expectedTargetUrl,
    });
  }

  return { installed: true, cronJob: mapEulaCacheRefreshCronJob(job) };
}

/** Idempotent seed for the built-in EULA cache refresh CronJob. */
export async function seedTextIntegrityEulaCacheRefreshCronJob(): Promise<void> {
  await dbSeedBuiltinCronJob(
    TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID,
    await buildEulaCacheRefreshCronSeedInput(),
  );
}

/** Admin install: create the CronJob row when missing; returns current status. */
export async function installTextIntegrityEulaCacheRefreshCronJob(): Promise<TextIntegrityEulaCacheRefreshCronStatus> {
  const seedInput = await buildEulaCacheRefreshCronSeedInput();
  const existing = await dbGetCronJob(TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID);
  if (!existing) {
    await dbSeedBuiltinCronJob(TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID, seedInput);
  } else {
    await dbUpdateCronJob(TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID, {
      target_url: seedInput.target_url,
      target_scope: seedInput.target_scope,
      target_auth: seedInput.target_auth,
    });
  }
  return getTextIntegrityEulaCacheRefreshCronStatus();
}
