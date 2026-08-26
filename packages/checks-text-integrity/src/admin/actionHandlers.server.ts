import type {
  Context,
  ExtensionAdminActionHandler,
  ExtensionCheckHandleActionResult,
} from '@curvenote/scms-core';
import { getPrismaClient, safeObjectDataUpdate } from '@curvenote/scms-server';
import { coerceToObject } from '@curvenote/scms-core';
import { formatDate } from '@curvenote/common';
import type { Prisma } from '@curvenote/scms-db';
import { uuidv7 as uuid } from 'uuidv7';
import type {
  TextIntegrityCredentialsStored,
  TextIntegrityStoredObject,
} from '../server/config.server.js';
import {
  TEXT_INTEGRITY_CONFIG_OBJECT_TYPE,
  cloneJsonObject,
  coerceTextIntegrityStoredObject,
  getTextIntegrityConfigWithOverrides,
  pickTextIntegrityCredentialsForWrite,
} from '../server/config.server.js';
import {
  applyTextIntegritySettingPatch,
  buildDefaultSettings,
  cloneServiceSettings,
  isSettingsEmpty,
  reconcileSettingsWithFeatures,
} from '../server/text-integrity-settings.server.js';
import {
  checksRelayConfigureUrl,
  checksRelayStatusUrl,
  resolveRelayInstanceId,
} from '../server/relay-urls.server.js';
import { runEulaCacheCronRefresh, type TextIntegrityEulaContext } from '../server/eula.server.js';
import { loadTextIntegrityFailedRunsPage } from './loadFailedRuns.server.js';
import {
  retryTextIntegrityCheckRun,
  retryTextIntegrityFailedRunsBulk,
} from '../server/retryCheckRun.server.js';
import {
  getTextIntegrityRetrySweepCronStatus,
  installTextIntegrityRetrySweepCronJob,
} from '../server/retrySweep.server.js';
import {
  getTextIntegrityEulaCacheRefreshCronStatus,
  installTextIntegrityEulaCacheRefreshCronJob,
} from '../server/eulaCacheCron.server.js';

type AppChecksConfig = {
  relayBaseUrl?: string;
  relayApiKey?: string;
};

type Phase = 'relay' | 'relay_auth' | 'provider';

type ActionError = {
  type: string;
  message: string;
  phase?: Phase;
  status?: number;
};

type RelaySessionOk = {
  relayBaseUrl: string;
  relayApiKey: string;
  relayInstanceId: string;
  serviceName: string;
};

const RELAY_LIVENESS_TIMEOUT_MS = 10_000;

function getAppChecks(ctx: Context): AppChecksConfig | undefined {
  const app = ctx.$config?.app as { checks?: AppChecksConfig } | undefined;
  return app?.checks;
}

function resolveTextIntegrityServiceName(mergedExtensionConfig: Record<string, unknown>): string {
  const fromExt = mergedExtensionConfig.serviceName;
  if (typeof fromExt === 'string' && fromExt.trim() !== '') return fromExt.trim();
  return 'echo';
}

function stripCredentialsFromStoredData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const o = data as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials: _omit, ...rest } = o;
  return rest;
}

async function loadTextIntegrityConfigurationSansCredentials(): Promise<Record<string, unknown>> {
  const prisma = await getPrismaClient();
  const row = await prisma.object.findFirst({
    where: { type: TEXT_INTEGRITY_CONFIG_OBJECT_TYPE },
    select: { data: true },
  });
  return stripCredentialsFromStoredData(row?.data ?? {});
}

async function fetchRelayServiceStatusPayload(ctx: Context, formData: FormData): Promise<unknown> {
  const session = await resolveTextIntegrityRelaySession(ctx, formData);
  if (!session.ok) return session.error;
  const features = await postRelayFeaturesAction(session.data);
  if (!features.ok) return features.error;
  return features.featuresResult;
}

async function getOrCreateTextIntegrityConfigObjectId(): Promise<string> {
  const prisma = await getPrismaClient();
  const existing = await prisma.object.findFirst({
    where: { type: TEXT_INTEGRITY_CONFIG_OBJECT_TYPE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const id = uuid();
  const now = formatDate();
  await prisma.object.create({
    data: {
      id,
      type: TEXT_INTEGRITY_CONFIG_OBJECT_TYPE,
      date_created: now,
      date_modified: now,
      data: {},
      occ: 0,
    },
    select: { id: true },
  });
  return id;
}

/**
 * GET /api/v1/ on checks-relay — no auth; confirms the relay process is reachable.
 */
async function checkRelayLiveness(
  relayBaseUrl: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = `${relayBaseUrl}/api/v1/`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RELAY_LIVENESS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    const rawText = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        message: `Checks relay returned HTTP ${res.status} from ${url}.`,
      };
    }
    let body: Record<string, unknown>;
    try {
      body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      return {
        ok: false,
        message: 'Checks relay liveness endpoint returned invalid JSON.',
      };
    }
    if (body.status !== 'ok' || body.service !== 'checks-relay') {
      return {
        ok: false,
        message:
          'Checks relay liveness response was not recognized (expected status "ok" and service "checks-relay").',
      };
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return {
        ok: false,
        message: `Checks relay did not respond within ${RELAY_LIVENESS_TIMEOUT_MS / 1000} seconds (${url}).`,
      };
    }
    const detail = e instanceof Error ? e.message : 'Unknown error';
    return {
      ok: false,
      message: `Cannot reach checks relay at ${url}: ${detail}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Liveness, merged extension config, and relay routing (instance id + service name).
 * Upstream API credentials are stored on checks-relay per instance; relay ignores credential fields in extension POST bodies.
 */
async function resolveTextIntegrityRelaySession(
  ctx: Context,
  formData: FormData,
): Promise<{ ok: true; data: RelaySessionOk } | { ok: false; error: ActionError }> {
  const checks = getAppChecks(ctx);
  const relayBaseUrl =
    typeof checks?.relayBaseUrl === 'string' ? checks.relayBaseUrl.trim().replace(/\/$/, '') : '';
  const relayApiKey = typeof checks?.relayApiKey === 'string' ? checks.relayApiKey : '';

  if (!relayBaseUrl || !relayApiKey) {
    return {
      ok: false,
      error: {
        type: 'config',
        message: 'Configure app.checks.relayBaseUrl and app.checks.relayApiKey in app config.',
      },
    };
  }

  const live = await checkRelayLiveness(relayBaseUrl);
  if (!live.ok) {
    return {
      ok: false,
      error: {
        type: 'relay_unreachable',
        message: live.message,
        phase: 'relay',
      },
    };
  }

  const extBase =
    (ctx.$config?.app?.extensions?.['checks-text-integrity'] as
      | Record<string, unknown>
      | undefined) ?? {};
  const prisma = await getPrismaClient();
  const merged = await getTextIntegrityConfigWithOverrides(extBase, prisma);
  const serviceNameRaw = (formData.get('serviceName') ?? '').toString().trim();
  const serviceName =
    serviceNameRaw !== '' ? serviceNameRaw : resolveTextIntegrityServiceName(merged);
  const relayInstanceIdRaw = (formData.get('relayInstanceId') ?? '').toString().trim();
  const relayInstanceId =
    relayInstanceIdRaw !== '' ? relayInstanceIdRaw : resolveRelayInstanceId(merged);

  return {
    ok: true,
    data: {
      relayBaseUrl,
      relayApiKey,
      relayInstanceId,
      serviceName,
    },
  };
}

/**
 * POST …/configure — on success returns the full parsed JSON body plus HTTP status for storage.
 */
async function postRelayServiceDetails(
  s: RelaySessionOk,
): Promise<
  { ok: true; serviceDetails: Record<string, unknown> } | { ok: false; error: ActionError }
> {
  const { relayBaseUrl, relayApiKey, relayInstanceId, serviceName } = s;
  const url = checksRelayConfigureUrl(relayBaseUrl, serviceName, relayInstanceId);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${relayApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const rawText = await res.text();
  let body: Record<string, unknown>;
  try {
    body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    return {
      ok: false,
      error: {
        type: 'relay_response',
        message: res.ok
          ? 'Invalid JSON from checks-relay configure endpoint.'
          : `Relay error (HTTP ${res.status}): ${rawText.slice(0, 200)}`,
        status: res.status,
        phase: res.ok ? 'provider' : 'relay',
      },
    };
  }

  if (res.status === 401 || res.status === 403) {
    const hint =
      (typeof body.error === 'string' ? body.error : null) ??
      (typeof body.message === 'string' ? body.message : null) ??
      'Invalid or missing relay API key.';
    return {
      ok: false,
      error: {
        type: 'relay_auth',
        message: hint,
        status: res.status,
        phase: 'relay_auth',
      },
    };
  }

  if (res.status === 404) {
    const errMsg =
      (typeof body.error === 'string' ? body.error : null) ??
      `Service "${serviceName}" not found on checks relay (configure).`;
    return {
      ok: false,
      error: {
        type: 'relay_service',
        message: errMsg,
        status: 404,
        phase: 'relay',
      },
    };
  }

  if (!res.ok) {
    const errMsg =
      (typeof body.error === 'string' ? body.error : null) ??
      (typeof body.message === 'string' ? body.message : null) ??
      `checks-relay returned HTTP ${res.status}`;
    return {
      ok: false,
      error: {
        type: 'relay_http',
        message: errMsg,
        status: res.status,
        phase: 'relay',
      },
    };
  }

  if (body.status === 'completed') {
    const serviceDetails: Record<string, unknown> = {
      httpStatus: res.status,
      ...body,
    };
    return { ok: true, serviceDetails };
  }
  if (body.status === 'error') {
    const msg = typeof body.message === 'string' ? body.message : 'Service configure failed';
    return {
      ok: false,
      error: {
        type: 'provider_error',
        message: msg,
        phase: 'provider',
      },
    };
  }

  return {
    ok: false,
    error: {
      type: 'relay_unexpected',
      message: `Unexpected configure response (body.status: ${String(body.status)}).`,
      phase: 'relay',
    },
  };
}

/**
 * POST …/status — service-level status; relay returns raw features-enabled JSON for the configured plugin.
 */
async function postRelayFeaturesAction(
  s: RelaySessionOk,
): Promise<{ ok: true; featuresResult: unknown } | { ok: false; error: ActionError }> {
  const { relayBaseUrl, relayApiKey, relayInstanceId, serviceName } = s;
  const serviceStatusUrl = checksRelayStatusUrl(relayBaseUrl, serviceName, relayInstanceId);
  const res = await fetch(serviceStatusUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${relayApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const rawText = await res.text();
  let body: Record<string, unknown>;
  try {
    body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: {
          type: 'relay_auth',
          message: `Checks relay rejected the API key (HTTP ${res.status}).`,
          status: res.status,
          phase: 'relay_auth',
        },
      };
    }
    return {
      ok: false,
      error: {
        type: 'relay_response',
        message: res.ok
          ? 'Invalid JSON from checks-relay service status endpoint.'
          : `Relay error (HTTP ${res.status}): ${rawText.slice(0, 200)}`,
        status: res.status,
        phase: res.ok ? 'provider' : 'relay',
      },
    };
  }

  if (res.status === 401 || res.status === 403) {
    const hint =
      (typeof body.error === 'string' ? body.error : null) ??
      (typeof body.message === 'string' ? body.message : null) ??
      'Invalid or missing relay API key.';
    return {
      ok: false,
      error: {
        type: 'relay_auth',
        message: hint,
        status: res.status,
        phase: 'relay_auth',
      },
    };
  }

  if (res.status === 404) {
    const errMsg =
      (typeof body.error === 'string' ? body.error : null) ??
      `Service "${serviceName}" not found on checks relay.`;
    return {
      ok: false,
      error: {
        type: 'relay_service',
        message: errMsg,
        status: 404,
        phase: 'relay',
      },
    };
  }

  if (!res.ok) {
    const errMsg =
      (typeof body.error === 'string' ? body.error : null) ??
      (typeof body.message === 'string' ? body.message : null) ??
      `checks-relay returned HTTP ${res.status}`;
    return {
      ok: false,
      error: {
        type: 'relay_http',
        message: errMsg,
        status: res.status,
        phase: 'relay',
      },
    };
  }

  if (typeof body.error === 'string' && body.error.length > 0) {
    return {
      ok: false,
      error: {
        type: 'relay_error',
        message: body.error,
        phase: 'relay',
      },
    };
  }

  return { ok: true, featuresResult: body };
}

/**
 * Resolves session and calls relay `features` (used by Test connection).
 * Features payload stays internal to relay helpers; only success/failure is surfaced to the platform.
 */
async function runTextIntegrityFeaturesCheck(
  ctx: Context,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: ActionError }> {
  const session = await resolveTextIntegrityRelaySession(ctx, formData);
  if (!session.ok) return session;
  const features = await postRelayFeaturesAction(session.data);
  if (!features.ok) return features;
  return { ok: true };
}

function mergeStoredObjectWithCredentials(
  prev: TextIntegrityStoredObject,
  credentials: TextIntegrityCredentialsStored,
): TextIntegrityStoredObject {
  const next: TextIntegrityStoredObject = { credentials };
  if (prev.manifest != null) {
    next.manifest = cloneJsonObject(prev.manifest);
  }
  if (prev.features != null) {
    next.features = cloneJsonObject(prev.features);
  }
  if (prev.webhooks != null) {
    next.webhooks = JSON.parse(JSON.stringify(prev.webhooks)) as unknown[];
  }
  if (prev.defaults != null) {
    next.defaults = JSON.parse(JSON.stringify(prev.defaults)) as typeof prev.defaults;
  }
  if (prev.settings != null) {
    next.settings = cloneServiceSettings(prev.settings);
  }
  if (typeof prev.notifyBaseUrl === 'string') {
    next.notifyBaseUrl = prev.notifyBaseUrl;
  }
  if (typeof prev.relayInstanceId === 'string' && prev.relayInstanceId.trim() !== '') {
    next.relayInstanceId = prev.relayInstanceId.trim();
  }
  if (typeof prev.serviceName === 'string' && prev.serviceName.trim() !== '') {
    next.serviceName = prev.serviceName.trim();
  }
  return next;
}

function parseRelayStatusForStorage(body: unknown):
  | {
      ok: true;
      manifest?: Record<string, unknown>;
      features: Record<string, unknown>;
      webhooks: unknown[];
    }
  | { ok: false; error: ActionError } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      error: {
        type: 'relay_status_shape',
        message: 'Service status returned an invalid body.',
        phase: 'relay',
      },
    };
  }
  const o = body as Record<string, unknown>;
  if (!Array.isArray(o.webhooks)) {
    return {
      ok: false,
      error: {
        type: 'relay_status_shape',
        message: 'Service status response missing webhooks array.',
        phase: 'relay',
      },
    };
  }
  const f = o.features;
  if (f != null && (typeof f !== 'object' || Array.isArray(f))) {
    return {
      ok: false,
      error: {
        type: 'relay_status_shape',
        message: 'Service status response has invalid features.',
        phase: 'relay',
      },
    };
  }
  const m = o.manifest;
  const manifest =
    m != null && typeof m === 'object' && !Array.isArray(m)
      ? cloneJsonObject(m as Record<string, unknown>)
      : undefined;
  return {
    ok: true,
    manifest,
    features: f != null ? cloneJsonObject(f as Record<string, unknown>) : {},
    webhooks: JSON.parse(JSON.stringify(o.webhooks)) as unknown[],
  };
}

/**
 * Relay configure → service status → persist merged snapshot; returns stored config without credentials.
 */
async function performTextIntegrityConfigureAndPersist(
  ctx: Context,
  formData: FormData,
): Promise<
  { ok: true; configuration: Record<string, unknown> } | { ok: false; error: ActionError }
> {
  const session = await resolveTextIntegrityRelaySession(ctx, formData);
  if (!session.ok) return session;

  const s = session.data;
  const detailsRes = await postRelayServiceDetails(s);
  if (!detailsRes.ok) return detailsRes;

  const featuresRes = await postRelayFeaturesAction(s);
  if (!featuresRes.ok) return featuresRes;

  const parsedStatus = parseRelayStatusForStorage(featuresRes.featuresResult);
  if (!parsedStatus.ok) return parsedStatus;

  const objectId = await getOrCreateTextIntegrityConfigObjectId();
  await safeObjectDataUpdate<TextIntegrityStoredObject & Prisma.JsonObject>(objectId, (current) => {
    const prev = coerceTextIntegrityStoredObject(coerceToObject(current));
    const credentials = pickTextIntegrityCredentialsForWrite(prev.credentials, {});

    const stored: TextIntegrityStoredObject = {
      credentials,
      features: parsedStatus.features,
      webhooks: parsedStatus.webhooks,
    };
    if (parsedStatus.manifest) {
      stored.manifest = parsedStatus.manifest;
    } else if (prev.manifest != null) {
      stored.manifest = cloneJsonObject(prev.manifest);
    }
    if (typeof prev.notifyBaseUrl === 'string') {
      stored.notifyBaseUrl = prev.notifyBaseUrl;
    }
    if (typeof prev.relayInstanceId === 'string' && prev.relayInstanceId.trim() !== '') {
      stored.relayInstanceId = prev.relayInstanceId.trim();
    }
    if (typeof prev.serviceName === 'string' && prev.serviceName.trim() !== '') {
      stored.serviceName = prev.serviceName.trim();
    }
    if (prev.defaults != null) {
      stored.defaults = JSON.parse(JSON.stringify(prev.defaults)) as typeof prev.defaults;
    }

    if (prev.settings != null && !isSettingsEmpty(prev.settings)) {
      stored.settings = reconcileSettingsWithFeatures(
        cloneServiceSettings(prev.settings),
        parsedStatus.features,
      );
    } else {
      stored.settings = buildDefaultSettings(parsedStatus.features);
    }

    return stored as TextIntegrityStoredObject & Prisma.JsonObject;
  });

  const configuration = await loadTextIntegrityConfigurationSansCredentials();
  return { ok: true, configuration };
}

function parseRunIdsFromFormData(formData: FormData): string[] {
  return formData
    .getAll('runIds')
    .map((v) => v.toString().trim())
    .filter(Boolean);
}

export function getExtensionAdminActionHandlers(): ExtensionAdminActionHandler[] {
  return [
    {
      name: 'text-integrity-save-auth',
      handler: async (_ctx: Context, formData: FormData) => {
        try {
          const relayInstanceIdRaw = (formData.get('relayInstanceId') ?? '').toString().trim();
          const serviceNameRaw = (formData.get('serviceName') ?? '').toString().trim();
          const objectId = await getOrCreateTextIntegrityConfigObjectId();
          await safeObjectDataUpdate<TextIntegrityStoredObject & Prisma.JsonObject>(
            objectId,
            (current) => {
              const prev = coerceTextIntegrityStoredObject(coerceToObject(current));
              const credentials = pickTextIntegrityCredentialsForWrite(prev.credentials, {});
              const next = mergeStoredObjectWithCredentials(prev, credentials);
              if (relayInstanceIdRaw !== '') {
                next.relayInstanceId = relayInstanceIdRaw;
              } else {
                delete next.relayInstanceId;
              }
              if (serviceNameRaw !== '') {
                next.serviceName = serviceNameRaw;
              } else {
                delete next.serviceName;
              }
              return next as TextIntegrityStoredObject & Prisma.JsonObject;
            },
          );
          return { success: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to save';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'text-integrity-update-setting',
      handler: async (_ctx: Context, formData: FormData) => {
        try {
          const name = (formData.get('name') ?? '').toString();
          const value = (formData.get('value') ?? '').toString();
          if (!name) {
            return { error: { type: 'validation', message: 'Setting name is required' } };
          }

          const objectId = await getOrCreateTextIntegrityConfigObjectId();
          let validationMessage: string | null = null;

          await safeObjectDataUpdate<TextIntegrityStoredObject & Prisma.JsonObject>(
            objectId,
            (current) => {
              const prev = coerceTextIntegrityStoredObject(coerceToObject(current));
              const features = prev.features;
              if (features == null || typeof features !== 'object' || Array.isArray(features)) {
                validationMessage = 'Configure the service first so features are available.';
                return prev as TextIntegrityStoredObject & Prisma.JsonObject;
              }

              const currentSettings = isSettingsEmpty(prev.settings)
                ? buildDefaultSettings(features as Record<string, unknown>)
                : (prev.settings ?? {});

              const r = applyTextIntegritySettingPatch(
                currentSettings,
                features as Record<string, unknown>,
                name,
                value,
              );
              if (!r.ok) {
                validationMessage = r.message;
                return prev as TextIntegrityStoredObject & Prisma.JsonObject;
              }

              const next: TextIntegrityStoredObject = { ...prev, settings: r.settings };
              return next as TextIntegrityStoredObject & Prisma.JsonObject;
            },
          );

          if (validationMessage != null) {
            return { error: { type: 'validation', message: validationMessage } };
          }
          return { success: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to update setting';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'text-integrity-test-connection',
      handler: async (ctx: Context, formData: FormData) => {
        try {
          const r = await runTextIntegrityFeaturesCheck(ctx, formData);
          if (!r.ok) {
            return { error: r.error };
          }
          return { success: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Connection test failed';
          return {
            error: {
              type: 'general',
              message,
              phase: 'relay',
            },
          };
        }
      },
    },
    {
      name: 'text-integrity-refresh-eula',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handler: async (ctx: Context, _formData: FormData) => {
        try {
          const result = await runEulaCacheCronRefresh(ctx as TextIntegrityEulaContext);
          if (!result.refreshed || !result.eula?.version) {
            const detail = result.skipped ?? 'unknown';
            return {
              error: {
                type: 'general',
                message: `EULA cache was not refreshed (${detail}). Check relay configuration and provider terms.`,
              },
            };
          }
          return {
            success: true,
            eula: result.eula,
          } as ExtensionCheckHandleActionResult;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to refresh EULA cache';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'text-integrity-get-status',
      handler: async (ctx: Context, formData: FormData) => {
        try {
          const [configuration, status] = await Promise.all([
            loadTextIntegrityConfigurationSansCredentials(),
            fetchRelayServiceStatusPayload(ctx, formData),
          ]);
          return {
            success: true,
            status,
            configuration,
          } as ExtensionCheckHandleActionResult;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load status';
          return {
            error: {
              type: 'general',
              message,
              phase: 'relay',
            },
          };
        }
      },
    },
    {
      name: 'text-integrity-configure-service',
      handler: async (ctx: Context, formData: FormData) => {
        try {
          const r = await performTextIntegrityConfigureAndPersist(ctx, formData);
          if (!r.ok) {
            return { error: r.error };
          }
          return {
            success: true,
            configuration: r.configuration,
          } as ExtensionCheckHandleActionResult;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to configure service';
          return {
            error: {
              type: 'general',
              message,
              phase: 'relay',
            },
          };
        }
      },
    },
    {
      name: 'text-integrity-set-maintenance',
      handler: async (ctx: Context, formData: FormData) => {
        try {
          const enabled = formData.get('enabled') === 'true';
          const message = (formData.get('message') ?? '').toString().trim();
          const objectId = await getOrCreateTextIntegrityConfigObjectId();
          await safeObjectDataUpdate<TextIntegrityStoredObject & Prisma.JsonObject>(
            objectId,
            (current) => {
              const prev = coerceTextIntegrityStoredObject(coerceToObject(current));
              const next: TextIntegrityStoredObject = { ...prev };
              if (enabled) {
                next.maintenance = {
                  enabled: true,
                  ...(message ? { message } : {}),
                  updatedAt: new Date().toISOString(),
                  ...(ctx.user?.id ? { updatedByUserId: ctx.user.id } : {}),
                };
              } else {
                delete next.maintenance;
              }
              return next as TextIntegrityStoredObject & Prisma.JsonObject;
            },
          );
          return { success: true };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to save maintenance settings';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'text-integrity-retry-cron-status',
      handler: async () => {
        try {
          const retryCron = await getTextIntegrityRetrySweepCronStatus();
          return { success: true, retryCron };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load retry cron status';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'text-integrity-install-retry-cron',
      handler: async () => {
        try {
          const retryCron = await installTextIntegrityRetrySweepCronJob();
          return { success: true, retryCron };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to install retry cron job';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'text-integrity-eula-cron-status',
      handler: async () => {
        try {
          const eulaCron = await getTextIntegrityEulaCacheRefreshCronStatus();
          return { success: true, eulaCron };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to load EULA refresh cron status';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'text-integrity-install-eula-cron',
      handler: async () => {
        try {
          const eulaCron = await installTextIntegrityEulaCacheRefreshCronJob();
          return { success: true, eulaCron };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to install EULA refresh cron job';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'text-integrity-list-failed-runs',
      handler: async (_ctx: Context, formData: FormData) => {
        try {
          const page = Number(formData.get('page') ?? 1);
          const pageSize = Number(formData.get('pageSize') ?? 20);
          const result = await loadTextIntegrityFailedRunsPage({ page, pageSize });
          return { success: true, ...result };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load failed runs';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'text-integrity-retry-failed-run',
      handler: async (ctx: Context, formData: FormData) => {
        const runIds = parseRunIdsFromFormData(formData);
        const runId = runIds[0];
        if (!runId) {
          return { error: { type: 'validation', message: 'runIds is required' } };
        }
        try {
          const prisma = await getPrismaClient();
          const sourceRun = await prisma.checkServiceRun.findFirst({
            where: { id: runId, kind: 'checks-text-integrity' },
          });
          if (!sourceRun) {
            return { error: { type: 'general', message: 'Check run not found' } };
          }
          const outcome = await retryTextIntegrityCheckRun(
            ctx,
            sourceRun.work_version_id,
            runId,
            'admin',
          );
          if ('success' in outcome && outcome.success) {
            return {
              success: true,
              results: [
                {
                  runId,
                  ok: true,
                  checkRunId: (outcome as { checkRunId?: string }).checkRunId,
                },
              ],
            };
          }
          return {
            success: true,
            results: [
              {
                runId,
                ok: false,
                message: outcome.error?.message ?? 'Retry failed',
              },
            ],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Retry failed';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'text-integrity-retry-failed-runs-bulk',
      handler: async (ctx: Context, formData: FormData) => {
        const runIds = parseRunIdsFromFormData(formData);
        if (runIds.length === 0) {
          return { error: { type: 'validation', message: 'Select at least one run to retry' } };
        }
        try {
          const { results } = await retryTextIntegrityFailedRunsBulk(ctx, runIds);
          return { success: true, results };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Bulk retry failed';
          return { error: { type: 'general', message } };
        }
      },
    },
  ];
}
