import type { PrismaClient } from '@curvenote/scms-db';
import type { TextIntegrityDefaults, TextIntegrityServiceSettings } from '../settings-types.js';

export {
  isSmallMatchesViewSetting,
  type SmallMatchesViewSetting,
  type TextIntegrityDefaults,
  type TextIntegrityServiceSettings,
  type TextIntegrityViewSettingValue,
} from '../settings-types.js';

/**
 * Object table type for Text Integrity config overrides.
 * Stored JSON uses top-level `credentials`, `features`, and `webhooks` (from relay POST …/status after configure).
 */
export const TEXT_INTEGRITY_CONFIG_OBJECT_TYPE = 'extension:text-integrity:config';

/** Cached Turnitin EULA HTML and version metadata (large payload; not stored on config row). */
export const TEXT_INTEGRITY_ITHEnticate_OBJECT_TYPE = 'extension:text-integrity:ithenticate';

/** Reserved for future Object-row credential overrides (currently unused). */
export type TextIntegrityCredentialsStored = Record<string, never>;

/** Normalizes persisted credentials (drops legacy keys such as `apiKey`). */
export function pickTextIntegrityCredentialsForWrite(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: TextIntegrityCredentialsStored | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _patch: Partial<TextIntegrityCredentialsStored>,
): TextIntegrityCredentialsStored {
  return {};
}

/**
 * Shape stored in Object.data for type extension:text-integrity:config.
 * Legacy `featuresEnabled` / `serviceDetails` are read for migration only.
 */
export interface TextIntegrityStoredObject {
  credentials?: TextIntegrityCredentialsStored;
  /** Overrides extension YAML checks-relay plugin name when set. */
  serviceName?: string;
  /** Overrides extension YAML for relay URL instance segment when set. */
  relayInstanceId?: string;
  notifyBaseUrl?: string;
  /** Service manifest from the relay plugin (name, title, logo, etc.). */
  manifest?: Record<string, unknown>;
  /** Features-enabled payload from relay service status (object). */
  features?: Record<string, unknown>;
  /** Webhooks list from relay service status. */
  webhooks?: unknown[];
  /** Legacy; omitted on new writes (EULA cache uses {@link TEXT_INTEGRITY_ITHEnticate_OBJECT_TYPE}). */
  eula?: Record<string, unknown>;
  /** Legacy; omitted on new writes. */
  defaults?: TextIntegrityDefaults;
  /**
   * Admin-editable similarity / indexing options (seeded on first Configure, then patched in admin UI).
   * Mirrors report-related slices of the provider API (indexing + similarity generation/view settings).
   */
  settings?: TextIntegrityServiceSettings;
  /** When enabled, user-facing check actions that call third-party APIs are blocked. */
  maintenance?: {
    enabled: boolean;
    message?: string;
    updatedAt?: string;
    updatedByUserId?: string;
  };
}

/**
 * Flat fields merged onto app.extensions['checks-text-integrity'] for runtime / admin loaders.
 */
export interface TextIntegrityConfigOverlay {
  /** Checks-relay plugin name from extension YAML / Object overlay; runtime default echo when unset. */
  serviceName?: string;
  /** Relay URL instance segment; merged from extension yaml and Object row. */
  relayInstanceId?: string;
  /** Absolute base for Text Integrity webhook URLs (no trailing slash). Required at submit time. */
  notifyBaseUrl?: string;
  manifest?: Record<string, unknown>;
  features?: Record<string, unknown>;
  webhooks?: unknown[];
  defaults?: TextIntegrityDefaults;
  settings?: TextIntegrityServiceSettings;
  maintenance?: TextIntegrityStoredObject['maintenance'];
}

export function cloneJsonObject(v: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
}

function cloneJsonValue<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function isTextIntegrityDefaults(v: unknown): v is TextIntegrityDefaults {
  if (v == null || typeof v !== 'object') return false;
  return true;
}

/**
 * Normalizes raw Object.data into the stored shape and returns a copy safe to mutate/write.
 * Migrates `featuresEnabled` → `features`. Legacy `apiKey` / `credentials.apiKey` are ignored.
 */
export function coerceTextIntegrityStoredObject(data: unknown): TextIntegrityStoredObject {
  const raw =
    data != null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  const credentials: TextIntegrityCredentialsStored = {};

  const out: TextIntegrityStoredObject = { credentials };

  if (raw.features != null && typeof raw.features === 'object' && !Array.isArray(raw.features)) {
    out.features = cloneJsonObject(raw.features as Record<string, unknown>);
  } else if (
    raw.featuresEnabled != null &&
    typeof raw.featuresEnabled === 'object' &&
    !Array.isArray(raw.featuresEnabled)
  ) {
    out.features = cloneJsonObject(raw.featuresEnabled as Record<string, unknown>);
  }

  if (Array.isArray(raw.webhooks)) {
    out.webhooks = cloneJsonValue(raw.webhooks);
  }

  if (raw.manifest != null && typeof raw.manifest === 'object' && !Array.isArray(raw.manifest)) {
    out.manifest = cloneJsonObject(raw.manifest as Record<string, unknown>);
  }

  if (raw.eula != null && typeof raw.eula === 'object' && !Array.isArray(raw.eula)) {
    out.eula = cloneJsonObject(raw.eula as Record<string, unknown>);
  }

  if (isTextIntegrityDefaults(raw.defaults)) {
    out.defaults = raw.defaults;
  }

  if (raw.settings != null && typeof raw.settings === 'object' && !Array.isArray(raw.settings)) {
    out.settings = cloneJsonObject(
      raw.settings as Record<string, unknown>,
    ) as TextIntegrityServiceSettings;
  }

  if (typeof raw.notifyBaseUrl === 'string') {
    out.notifyBaseUrl = raw.notifyBaseUrl;
  }

  if (typeof raw.relayInstanceId === 'string') {
    out.relayInstanceId = raw.relayInstanceId;
  }

  if (typeof raw.serviceName === 'string') {
    out.serviceName = raw.serviceName;
  }

  if (
    raw.maintenance != null &&
    typeof raw.maintenance === 'object' &&
    !Array.isArray(raw.maintenance)
  ) {
    const m = raw.maintenance as Record<string, unknown>;
    out.maintenance = {
      enabled: m.enabled === true,
      ...(typeof m.message === 'string' && m.message.trim() !== ''
        ? { message: m.message.trim() }
        : {}),
      ...(typeof m.updatedAt === 'string' ? { updatedAt: m.updatedAt } : {}),
      ...(typeof m.updatedByUserId === 'string' ? { updatedByUserId: m.updatedByUserId } : {}),
    };
  }

  return out;
}

function parseOverlay(data: unknown): Partial<TextIntegrityConfigOverlay> {
  const stored = coerceTextIntegrityStoredObject(data);
  const overlay: Partial<TextIntegrityConfigOverlay> = {};
  if (typeof stored.notifyBaseUrl === 'string') overlay.notifyBaseUrl = stored.notifyBaseUrl;
  if (typeof stored.serviceName === 'string') overlay.serviceName = stored.serviceName;
  if (typeof stored.relayInstanceId === 'string') overlay.relayInstanceId = stored.relayInstanceId;
  if (stored.manifest) overlay.manifest = stored.manifest;
  if (stored.features) overlay.features = stored.features;
  if (stored.webhooks) overlay.webhooks = stored.webhooks;
  if (stored.defaults) overlay.defaults = stored.defaults;
  if (stored.settings) overlay.settings = stored.settings;
  if (stored.maintenance) overlay.maintenance = stored.maintenance;
  return overlay;
}

const ADMIN_SERVICE_CONFIGURATION_KEYS = [
  'manifest',
  'features',
  'webhooks',
  'defaults',
  'settings',
  'serviceName',
  'relayInstanceId',
] as const;

/**
 * Whitelisted non-secret fields from merged extension config for the admin UI JSON panel.
 */
export function buildStoredServiceConfigurationForAdmin(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ADMIN_SERVICE_CONFIGURATION_KEYS) {
    const v = config[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
      continue;
    }
    if (typeof v === 'object') {
      try {
        out[key] = JSON.parse(JSON.stringify(v)) as Record<string, unknown> | unknown[];
      } catch {
        // skip non-JSON-serializable values
      }
    }
  }
  return out;
}

/**
 * Builds or syncs defaults from the relay `features` object (service status).
 */
export function syncDefaultsFromFeatures(
  features: Record<string, unknown>,
  existingDefaults: TextIntegrityDefaults | undefined,
): TextIntegrityDefaults {
  const sim = features.similarity as
    | {
        generation_settings?: {
          search_repositories?: string[];
          submission_auto_excludes?: boolean;
        };
        view_settings?: Record<string, boolean | number>;
      }
    | undefined;
  const next: TextIntegrityDefaults = { similarity: {} };

  if (sim?.generation_settings) {
    const enabledRepos = sim.generation_settings.search_repositories ?? [];
    const existingRepos =
      existingDefaults?.similarity?.generation_settings?.search_repositories ?? [];
    const keptRepos = existingRepos.filter((r) => enabledRepos.includes(r));
    next.similarity!.generation_settings = {
      search_repositories: keptRepos.length > 0 ? keptRepos : [...enabledRepos],
      submission_auto_excludes:
        existingDefaults?.similarity?.generation_settings?.submission_auto_excludes ??
        sim.generation_settings.submission_auto_excludes ??
        false,
    };
  }

  if (sim?.view_settings && typeof sim.view_settings === 'object') {
    const enabledView = sim.view_settings;
    const existingView = existingDefaults?.similarity?.view_settings ?? {};
    next.similarity!.view_settings = {};
    for (const key of Object.keys(enabledView)) {
      next.similarity!.view_settings![key] =
        existingView[key] ?? (enabledView as Record<string, boolean | number>)[key] ?? false;
    }
  }

  return next;
}

/**
 * Returns base config with optional overrides from the Object table.
 * Loads the first Object row with type TEXT_INTEGRITY_CONFIG_OBJECT_TYPE (by date_modified desc)
 * and merges overlay fields onto the base config.
 *
 * Ignores legacy provider `apiKey` on the Object row and in app YAML.
 */
export async function getTextIntegrityConfigWithOverrides(
  baseConfig: Record<string, unknown>,
  prisma: PrismaClient,
): Promise<Record<string, unknown>> {
  const base = { ...baseConfig };
  delete base.apiKey;

  const row = await prisma.object.findFirst({
    where: { type: TEXT_INTEGRITY_CONFIG_OBJECT_TYPE },
    orderBy: { date_modified: 'desc' },
    select: { data: true },
  });
  if (!row?.data) return base;
  const overlay = parseOverlay(row.data);
  return { ...base, ...overlay };
}
