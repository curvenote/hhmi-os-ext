import {
  isSmallMatchesViewSetting,
  type SmallMatchesViewSetting,
  type TextIntegrityServiceSettings,
  type TextIntegrityViewSettingValue,
} from './config.server.js';
import {
  SEARCH_REPOSITORY_IDS,
  SEARCH_REPOSITORY_SETTING_IDS,
  VIEW_SETTING_KEYS,
  type ViewSettingKey,
} from '../settings-catalog.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

type SimilarityGenerationSettings = NonNullable<
  NonNullable<TextIntegrityServiceSettings['similarity']>['generation_settings']
>;

const DEFAULT_ADD_TO_INDEX = false;
const DEFAULT_SMALL_MATCH_WORD_THRESHOLD = 8;
const DEFAULT_BOOLEAN_VIEW_SETTING = false;
const DEFAULT_SELF_MATCHING_AUTO_EXCLUDES = true;
const DEFAULT_SELF_MATCHING_SCOPE: NonNullable<
  SimilarityGenerationSettings['auto_exclude_self_matching_scope']
> = 'NONE';

export function getFeaturesSimilarity(
  features: Record<string, unknown>,
): Record<string, unknown> | null {
  const sim = features.similarity;
  if (!isRecord(sim)) return null;
  return sim;
}

/** True when settings were never seeded or are an empty shell. */
export function isSettingsEmpty(settings: TextIntegrityServiceSettings | undefined): boolean {
  if (settings == null) return true;
  if (Object.keys(settings).length === 0) return true;
  const idx = settings.indexing_settings;
  const sim = settings.similarity;
  const hasIdx = isRecord(idx) && Object.keys(idx).length > 0;
  const hasSim = isRecord(sim) && Object.keys(sim).length > 0;
  return !hasIdx && !hasSim;
}

function getTenantSearchRepositories(generationSettings: Record<string, unknown> | null): string[] {
  if (!generationSettings || !Array.isArray(generationSettings.search_repositories)) return [];

  return generationSettings.search_repositories.filter(
    (id): id is string =>
      typeof id === 'string' && (SEARCH_REPOSITORY_SETTING_IDS as readonly string[]).includes(id),
  );
}

function buildDefaultViewSettings(
  viewFeatures: Record<string, unknown> | null,
): Record<string, TextIntegrityViewSettingValue> {
  if (!viewFeatures) return {};

  const defaults: Record<string, TextIntegrityViewSettingValue> = {};
  for (const key of VIEW_SETTING_KEYS) {
    if (key in viewFeatures) {
      if (key === 'exclude_small_matches') continue;
      defaults[key] = DEFAULT_BOOLEAN_VIEW_SETTING;
    }
  }
  return defaults;
}

function tenantSupportsSelfMatchingAutoExcludes(
  generationSettings: Record<string, unknown> | null,
): boolean {
  return (
    generationSettings != null &&
    'submission_auto_excludes' in generationSettings &&
    generationSettings.submission_auto_excludes === true
  );
}

function buildDefaultGenerationSettings(
  generationSettings: Record<string, unknown> | null,
): SimilarityGenerationSettings {
  const defaults: SimilarityGenerationSettings = {
    search_repositories: getTenantSearchRepositories(generationSettings),
  };

  if (
    DEFAULT_SELF_MATCHING_AUTO_EXCLUDES &&
    tenantSupportsSelfMatchingAutoExcludes(generationSettings)
  ) {
    defaults.auto_exclude_self_matching_scope = DEFAULT_SELF_MATCHING_SCOPE;
  }

  return defaults;
}

/**
 * Initial full settings snapshot after first configure.
 * Includes boolean view keys only for flags present in provider `view_settings` (any boolean);
 * values default to off. Numeric view settings are omitted until explicitly enabled.
 * Search repos default to all tenant-allowed selectable repos.
 */
export function buildDefaultSettings(
  features: Record<string, unknown>,
): TextIntegrityServiceSettings {
  const sim = getFeaturesSimilarity(features);
  const gen = sim && isRecord(sim.generation_settings) ? sim.generation_settings : null;
  const viewRaw =
    sim && isRecord(sim.view_settings) && !Array.isArray(sim.view_settings)
      ? (sim.view_settings as Record<string, unknown>)
      : null;

  return {
    indexing_settings: { add_to_index: DEFAULT_ADD_TO_INDEX },
    similarity: {
      generation_settings: buildDefaultGenerationSettings(gen),
      view_settings: buildDefaultViewSettings(viewRaw),
    },
  };
}

/**
 * After a subsequent configure: keep admin choices but drop paths the tenant no longer allows.
 */
export function reconcileSettingsWithFeatures(
  settings: TextIntegrityServiceSettings,
  features: Record<string, unknown>,
): TextIntegrityServiceSettings {
  const next = JSON.parse(JSON.stringify(settings)) as TextIntegrityServiceSettings;
  const sim = getFeaturesSimilarity(features);
  const gen = sim && isRecord(sim.generation_settings) ? sim.generation_settings : null;
  const viewFeat =
    sim && isRecord(sim.view_settings) && !Array.isArray(sim.view_settings)
      ? (sim.view_settings as Record<string, unknown>)
      : null;

  const allowedRepos = new Set<string>();
  if (gen && Array.isArray(gen.search_repositories)) {
    for (const id of gen.search_repositories) {
      if (
        typeof id === 'string' &&
        (SEARCH_REPOSITORY_SETTING_IDS as readonly string[]).includes(id)
      ) {
        allowedRepos.add(id);
      }
    }
  }

  if (next.similarity?.generation_settings?.search_repositories != null) {
    next.similarity.generation_settings.search_repositories =
      next.similarity.generation_settings.search_repositories.filter((r) => allowedRepos.has(r));
  }

  const submissionAuto =
    gen != null && 'submission_auto_excludes' in gen
      ? gen.submission_auto_excludes === true
      : false;
  if (!submissionAuto && next.similarity?.generation_settings) {
    delete next.similarity.generation_settings.auto_exclude_self_matching_scope;
  }

  const vs = next.similarity?.view_settings;
  if (vs != null && typeof vs === 'object') {
    if (!viewFeat) {
      if (next.similarity != null) {
        delete next.similarity.view_settings;
      }
    } else {
      for (const key of Object.keys(vs)) {
        if (viewFeat[key] !== true) {
          delete (vs as Record<string, unknown>)[key];
        }
      }
      if (Object.keys(vs).length === 0 && next.similarity) {
        delete next.similarity.view_settings;
      }
    }
  }

  if (
    next.similarity?.generation_settings &&
    Object.keys(next.similarity.generation_settings).length === 0
  ) {
    delete next.similarity.generation_settings;
  }
  if (next.similarity && Object.keys(next.similarity).length === 0) {
    delete next.similarity;
  }

  return next;
}

export function cloneServiceSettings(
  settings: TextIntegrityServiceSettings | undefined,
): TextIntegrityServiceSettings {
  if (settings == null) return {};
  return JSON.parse(JSON.stringify(settings)) as TextIntegrityServiceSettings;
}

export function tenantRepoEnabled(features: Record<string, unknown>, repoId: string): boolean {
  if (!(SEARCH_REPOSITORY_SETTING_IDS as readonly string[]).includes(repoId)) return false;
  const sim = getFeaturesSimilarity(features);
  if (!sim) return false;
  const gen = sim.generation_settings;
  if (!isRecord(gen) || !Array.isArray(gen.search_repositories)) return false;
  return (gen.search_repositories as unknown[]).some((x) => x === repoId);
}

export function tenantViewSettingEnabled(
  features: Record<string, unknown>,
  key: ViewSettingKey,
): boolean {
  const sim = getFeaturesSimilarity(features);
  if (!sim || !isRecord(sim.view_settings)) return false;
  return (sim.view_settings as Record<string, unknown>)[key] === true;
}

const SMALL_MATCH_MIN = 1;
const SMALL_MATCH_MAX = 20;

function readSmallMatchesViewSetting(
  settings: TextIntegrityServiceSettings,
): SmallMatchesViewSetting {
  const raw = settings.similarity?.view_settings?.exclude_small_matches;
  if (isSmallMatchesViewSetting(raw)) {
    return {
      enabled: raw.enabled,
      word_threshold: Math.min(
        SMALL_MATCH_MAX,
        Math.max(SMALL_MATCH_MIN, Math.floor(raw.word_threshold)),
      ),
    };
  }
  return { enabled: false, word_threshold: DEFAULT_SMALL_MATCH_WORD_THRESHOLD };
}

export type ApplySettingPatchResult =
  | { ok: true; settings: TextIntegrityServiceSettings }
  | { ok: false; message: string };

/**
 * Validates and applies one admin setting patch, returning a fresh settings object.
 */
export function applyTextIntegritySettingPatch(
  settings: TextIntegrityServiceSettings,
  features: Record<string, unknown>,
  name: string,
  value: string,
): ApplySettingPatchResult {
  const next = cloneServiceSettings(settings);

  const scopeMatch = /^search_repo_(.+)$/.exec(name);
  if (scopeMatch) {
    const repoId = scopeMatch[1];
    if (!(SEARCH_REPOSITORY_IDS as readonly string[]).includes(repoId)) {
      return { ok: false, message: 'Unknown search repository' };
    }
    if (!(SEARCH_REPOSITORY_SETTING_IDS as readonly string[]).includes(repoId)) {
      return { ok: false, message: 'This search repository is fixed off' };
    }
    if (!tenantRepoEnabled(features, repoId)) {
      return { ok: false, message: 'This search repository is not enabled for your tenant' };
    }
    if (value !== 'true' && value !== 'false') {
      return { ok: false, message: 'Invalid value' };
    }
    const on = value === 'true';
    next.similarity = next.similarity ?? {};
    next.similarity.generation_settings = next.similarity.generation_settings ?? {};
    const repos = new Set(next.similarity.generation_settings.search_repositories ?? []);
    if (on) repos.add(repoId);
    else repos.delete(repoId);
    next.similarity.generation_settings.search_repositories = Array.from(repos);
    return { ok: true, settings: next };
  }

  if ((VIEW_SETTING_KEYS as readonly string[]).includes(name)) {
    const key = name as ViewSettingKey;
    if (!tenantViewSettingEnabled(features, key)) {
      return { ok: false, message: 'This view option is not enabled for your tenant' };
    }
    if (key === 'exclude_small_matches') {
      next.similarity = next.similarity ?? {};
      next.similarity.view_settings = next.similarity.view_settings ?? {};

      const smallMatches = readSmallMatchesViewSetting(next);
      if (value === 'false' || value === '0') {
        next.similarity.view_settings[key] = { ...smallMatches, enabled: false };
        return { ok: true, settings: next };
      }
      if (value === 'true') {
        next.similarity.view_settings[key] = { ...smallMatches, enabled: true };
        return { ok: true, settings: next };
      }
      const n = Math.floor(Number(value));
      if (Number.isNaN(n) || n < SMALL_MATCH_MIN || n > SMALL_MATCH_MAX) {
        return { ok: false, message: 'Invalid word threshold' };
      }
      next.similarity.view_settings[key] = { ...smallMatches, word_threshold: n };
      return { ok: true, settings: next };
    }
    if (value !== 'true' && value !== 'false') {
      return { ok: false, message: 'Invalid value' };
    }
    next.similarity = next.similarity ?? {};
    next.similarity.view_settings = next.similarity.view_settings ?? {};
    next.similarity.view_settings[key] = value === 'true';
    return { ok: true, settings: next };
  }

  return { ok: false, message: 'Unknown setting name' };
}
