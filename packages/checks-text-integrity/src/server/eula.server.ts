import { getPrismaClient } from '@curvenote/scms-server';
import type { Prisma } from '@curvenote/scms-db';
/** Minimal context for EULA helpers (compatible with extension action `ctx`). */
export type TextIntegrityEulaContext = {
  $config?: Record<string, unknown>;
  user?: { id?: string; data?: unknown } | null;
};
import { getTextIntegrityConfigWithOverrides } from './config.server.js';
import { loadCachedEula, persistCachedEula, type CachedEula } from './eula-object.server.js';
export type { CachedEula } from './eula-object.server.js';
import {
  mergeIthenticateEulaAcceptance,
  readIthenticateEulaAcceptance,
  type IthenticateEulaAcceptance,
} from './eula-user-data.js';
import {
  checksRelayTermsAcceptUrl,
  checksRelayTermsUrl,
  resolveRelayInstanceId,
} from './relay-urls.server.js';

const EULA_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EULA_LANG = 'en-US';
const EULA_RELAY_LOG_LABEL = '[checks-text-integrity:eula-relay]';

type AppChecksConfig = {
  relayBaseUrl?: string;
  relayApiKey?: string;
};

function getAppChecks(ctx: TextIntegrityEulaContext): AppChecksConfig | undefined {
  const app = ctx.$config?.app as { checks?: AppChecksConfig } | undefined;
  return app?.checks;
}

function relayErrorDetails(error: unknown) {
  const cause =
    error instanceof Error && 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack : undefined,
    cause,
  };
}

function logEulaRelayError(message: string, details: Record<string, unknown>) {
  console.error(EULA_RELAY_LOG_LABEL, message, details);
}

function getTextIntegrityExtensionConfig(ctx: TextIntegrityEulaContext): Record<string, unknown> {
  const app = ctx.$config?.app as
    | { extensions?: Record<string, Record<string, unknown>> }
    | undefined;
  return (app?.extensions?.['checks-text-integrity'] as Record<string, unknown>) ?? {};
}

function resolveServiceName(merged: Record<string, unknown>): string {
  const fromExt = merged.serviceName;
  if (typeof fromExt === 'string' && fromExt.trim() !== '') return fromExt.trim();
  return 'ithenticate';
}

export function isEulaRequired(mergedConfig: Record<string, unknown>): boolean {
  const features = mergedConfig.features;
  if (features != null && typeof features === 'object' && !Array.isArray(features)) {
    const tenant = (features as Record<string, unknown>).tenant;
    if (tenant != null && typeof tenant === 'object' && !Array.isArray(tenant)) {
      const require = (tenant as Record<string, unknown>).require_eula;
      if (require === false) return false;
      if (require === true) return true;
    }
  }
  return true;
}

function isEulaCacheStale(cached: CachedEula | undefined): boolean {
  if (!cached?.date_fetched) return true;
  const fetched = Date.parse(cached.date_fetched);
  if (Number.isNaN(fetched)) return true;
  return Date.now() - fetched > EULA_CACHE_MAX_AGE_MS;
}

async function relayPost(
  operation: string,
  url: string,
  relayApiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${relayApiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    logEulaRelayError('relay request threw', {
      operation,
      url,
      bodyKeys: Object.keys(body),
      error: relayErrorDetails(error),
    });
    throw error;
  }

  const text = await res.text().catch((error: unknown) => {
    logEulaRelayError('failed to read relay response body', {
      operation,
      url,
      status: res.status,
      statusText: res.statusText,
      error: relayErrorDetails(error),
    });
    return '';
  });
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = text;
    }
  }
  if (!res.ok) {
    logEulaRelayError('relay returned non-OK response', {
      operation,
      url,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get('content-type'),
      bodyText: text,
      bodyJson: json,
    });
  }
  return { ok: res.ok, status: res.status, json, text };
}

/**
 * Fetches latest EULA version + HTML from checks-relay and persists to the iThenticate Object row.
 * When `force` is false, returns the existing cache if younger than 24 hours.
 */
export async function refreshEulaCache(
  ctx: TextIntegrityEulaContext,
  mergedConfig: Record<string, unknown>,
  options?: { force?: boolean },
): Promise<{ cached: CachedEula | undefined; refreshed: boolean; skipped?: string }> {
  const prisma = await getPrismaClient();
  const cached = await loadCachedEula(prisma);
  if (!options?.force && cached && !isEulaCacheStale(cached)) {
    return { cached, refreshed: false, skipped: 'cache_fresh' };
  }

  const checks = getAppChecks(ctx);
  const relayBaseUrl = (checks?.relayBaseUrl ?? '').trim().replace(/\/$/, '');
  const relayApiKey = (checks?.relayApiKey ?? '').trim();
  if (!relayBaseUrl || !relayApiKey) {
    return {
      cached,
      refreshed: false,
      skipped: 'relay_not_configured',
    };
  }

  const serviceName = resolveServiceName(mergedConfig);
  const relayInstanceId = resolveRelayInstanceId(mergedConfig);
  const termsUrl = checksRelayTermsUrl(relayBaseUrl, serviceName, relayInstanceId);

  const versionRes = await relayPost('getTerms:metadata', termsUrl, relayApiKey, {
    lang: DEFAULT_EULA_LANG,
  });
  if (!versionRes.ok) {
    return {
      cached,
      refreshed: false,
      skipped: `relay_terms_failed_${versionRes.status}`,
    };
  }

  const versionBody = versionRes.json as {
    result?: {
      version?: string;
      url?: string;
      validFrom?: string;
      validUntil?: string | null;
      availableLanguages?: string[];
    };
  };
  const versionMeta = versionBody?.result;
  if (!versionMeta?.version) {
    return {
      cached,
      refreshed: false,
      skipped: 'relay_terms_missing_version',
    };
  }

  const pageRes = await relayPost('getTerms:page', termsUrl, relayApiKey, {
    mode: 'page',
    version: versionMeta.version,
    lang: DEFAULT_EULA_LANG,
  });

  const pageBody = pageRes.ok
    ? (pageRes.json as { result?: { html?: string } })?.result
    : undefined;

  const nextEula: CachedEula = {
    version: versionMeta.version,
    url: versionMeta.url,
    validFrom: versionMeta.validFrom,
    validUntil: versionMeta.validUntil ?? null,
    availableLanguages: versionMeta.availableLanguages,
    html: pageBody?.html,
    date_fetched: new Date().toISOString(),
  };

  await persistCachedEula(nextEula);

  return { cached: nextEula, refreshed: true };
}

export async function refreshEulaCacheIfStale(
  ctx: TextIntegrityEulaContext,
  mergedConfig: Record<string, unknown>,
): Promise<CachedEula | undefined> {
  const { cached } = await refreshEulaCache(ctx, mergedConfig);
  return cached;
}

/** Cron / webhook entry: always run relay getTerms + page fetch and update Object cache. */
export async function runEulaCacheCronRefresh(ctx: TextIntegrityEulaContext): Promise<{
  refreshed: boolean;
  skipped?: string;
  eula?: { version: string; date_fetched: string };
}> {
  const baseExt = getTextIntegrityExtensionConfig(ctx);
  const prisma = await getPrismaClient();
  const mergedConfig = await getTextIntegrityConfigWithOverrides(baseExt, prisma);
  const { cached, refreshed, skipped } = await refreshEulaCache(ctx, mergedConfig, {
    force: true,
  });
  return {
    refreshed,
    skipped,
    eula: cached ? { version: cached.version, date_fetched: cached.date_fetched } : undefined,
  };
}

export function hasAcceptedLatestEula(userData: unknown, cached: CachedEula | undefined): boolean {
  if (!cached?.version) return false;
  const acceptance = readIthenticateEulaAcceptance(userData);
  return acceptance?.version === cached.version;
}

export async function getEulaStatusForUser(ctx: TextIntegrityEulaContext): Promise<{
  requireEula: boolean;
  accepted: boolean;
  eula?: { version: string; html?: string; url?: string };
}> {
  const baseExt = getTextIntegrityExtensionConfig(ctx);
  const prisma = await getPrismaClient();
  const mergedConfig = await getTextIntegrityConfigWithOverrides(baseExt, prisma);
  const requireEula = isEulaRequired(mergedConfig);

  const cached = await refreshEulaCacheIfStale(ctx, mergedConfig);

  const user = ctx.user?.id
    ? await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { data: true },
      })
    : null;

  const accepted = !requireEula || hasAcceptedLatestEula(user?.data, cached);

  return {
    requireEula,
    accepted,
    eula: cached
      ? {
          version: cached.version,
          html: cached.html,
          url: cached.url,
        }
      : undefined,
  };
}

export async function recordUserEulaAcceptance(
  ctx: TextIntegrityEulaContext,
  acceptance: IthenticateEulaAcceptance,
): Promise<void> {
  const userId = ctx.user?.id;
  if (!userId) {
    throw new Error('Signed-in user required to accept EULA');
  }

  const prisma = await getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { data: true },
  });
  const nextData = mergeIthenticateEulaAcceptance(user?.data, acceptance);
  const timestamp = new Date().toISOString();
  await prisma.user.update({
    where: { id: userId },
    data: {
      data: nextData as Prisma.JsonObject,
      date_modified: timestamp,
    },
  });
}

export async function acceptEulaAtProvider(
  ctx: TextIntegrityEulaContext,
  version: string,
  language: string,
  acceptedAt: string,
): Promise<void> {
  const checks = getAppChecks(ctx);
  const relayBaseUrl = (checks?.relayBaseUrl ?? '').trim().replace(/\/$/, '');
  const relayApiKey = (checks?.relayApiKey ?? '').trim();
  const userId = ctx.user?.id;
  if (!relayBaseUrl || !relayApiKey) {
    throw new Error('Checks relay is not configured');
  }
  if (!userId) {
    throw new Error('Signed-in user required to accept EULA');
  }

  const baseExt = getTextIntegrityExtensionConfig(ctx);
  const prisma = await getPrismaClient();
  const mergedConfig = await getTextIntegrityConfigWithOverrides(baseExt, prisma);
  const serviceName = resolveServiceName(mergedConfig);
  const relayInstanceId = resolveRelayInstanceId(mergedConfig);
  const acceptUrl = checksRelayTermsAcceptUrl(relayBaseUrl, serviceName, relayInstanceId);

  const res = await relayPost('acceptTerms', acceptUrl, relayApiKey, {
    userId,
    version,
    language,
    acceptedTimestamp: acceptedAt,
  });

  if (!res.ok) {
    const msg =
      res.json != null &&
      typeof res.json === 'object' &&
      res.json !== null &&
      typeof (res.json as { message?: string }).message === 'string'
        ? (res.json as { message: string }).message
        : `Checks relay terms accept failed (${res.status})`;
    throw new Error(msg);
  }
}

export function buildUploadEulaMetadata(
  userData: unknown,
  cached: CachedEula | undefined,
): { version: string; accepted_timestamp: string; language: string } | undefined {
  const acceptance = readIthenticateEulaAcceptance(userData);
  if (!acceptance || !cached?.version || acceptance.version !== cached.version) {
    return undefined;
  }
  return {
    version: acceptance.version,
    accepted_timestamp: acceptance.acceptedAt,
    language: acceptance.language,
  };
}

export async function assertSubmitterEulaAccepted(
  ctx: TextIntegrityEulaContext,
): Promise<string | undefined> {
  const status = await getEulaStatusForUser(ctx);
  if (!status.requireEula) return undefined;
  if (status.accepted) return undefined;
  return 'You must accept the Turnitin EULA before using text integrity.';
}

export const EULA_VERSION_STALE_USER_MESSAGE =
  'Turnitin updated their terms. Please review and accept the new EULA, then run the check again.';

export function isRelayEulaNotAccepted(params: {
  httpStatus: number;
  result?: { code?: string; statusCode?: number };
}): boolean {
  if (params.httpStatus === 451) return true;
  const result = params.result;
  if (result?.code === 'EULA_NOT_ACCEPTED') return true;
  if (result?.statusCode === 451) return true;
  return false;
}

/**
 * After checks-relay/TCA returns EULA-not-accepted, force-refresh cached terms and return a
 * user-facing message (version drift vs provider rejection).
 */
export async function resolveEulaSubmitFailureMessage(
  ctx: TextIntegrityEulaContext,
  mergedConfig: Record<string, unknown>,
  providerMessage?: string,
): Promise<string> {
  await refreshEulaCache(ctx, mergedConfig, { force: true });

  if (!isEulaRequired(mergedConfig)) {
    const trimmed = providerMessage?.trim();
    return trimmed || 'Submitter has not accepted the required Turnitin EULA.';
  }

  const prisma = await getPrismaClient();
  const user = ctx.user?.id
    ? await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { data: true },
      })
    : null;
  const cached = await loadCachedEula(prisma);

  if (!hasAcceptedLatestEula(user?.data, cached)) {
    return EULA_VERSION_STALE_USER_MESSAGE;
  }

  const trimmed = providerMessage?.trim();
  return (
    trimmed ||
    'Submitter has not accepted the required Turnitin EULA. Please accept the terms and run the check again.'
  );
}

export const EULA_ADMIN_RETRY_SKIP_MESSAGE =
  'The original submitter has not accepted the current Turnitin EULA. The user must retry manually from the work checks page.';

/**
 * Read-only EULA check for admin retry: original submitter must have accepted the latest cached version.
 */
export async function assertOriginalSubmitterEulaCurrent(
  ctx: TextIntegrityEulaContext,
  submitterUserId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!submitterUserId?.trim()) {
    return {
      ok: false,
      message: 'This check run has no recorded submitter; cannot retry on their behalf.',
    };
  }

  const baseExt = getTextIntegrityExtensionConfig(ctx);
  const prisma = await getPrismaClient();
  const mergedConfig = await getTextIntegrityConfigWithOverrides(baseExt, prisma);
  if (!isEulaRequired(mergedConfig)) {
    return { ok: true };
  }

  const cached = await refreshEulaCacheIfStale(ctx, mergedConfig);
  const user = await prisma.user.findUnique({
    where: { id: submitterUserId.trim() },
    select: { data: true },
  });
  if (!user) {
    return { ok: false, message: 'Original submitter account was not found.' };
  }
  if (!hasAcceptedLatestEula(user.data, cached)) {
    return { ok: false, message: EULA_ADMIN_RETRY_SKIP_MESSAGE };
  }
  return { ok: true };
}

/** EULA metadata for TCA viewer-url requests (same shape as upload). */
export async function buildViewerEulaPayload(
  ctx: TextIntegrityEulaContext,
): Promise<{ version: string; accepted_timestamp: string; language: string } | undefined> {
  const baseExt = getTextIntegrityExtensionConfig(ctx);
  const prisma = await getPrismaClient();
  const mergedConfig = await getTextIntegrityConfigWithOverrides(baseExt, prisma);
  if (!isEulaRequired(mergedConfig)) return undefined;

  const cached = await refreshEulaCacheIfStale(ctx, mergedConfig);
  const userId = ctx.user?.id;
  if (!userId) return undefined;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { data: true },
  });
  return buildUploadEulaMetadata(user?.data, cached);
}
