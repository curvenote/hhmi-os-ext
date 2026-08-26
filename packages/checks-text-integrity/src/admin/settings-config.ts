import { isSmallMatchesViewSetting, type TextIntegrityServiceSettings } from '../settings-types.js';
import {
  SEARCH_REPOSITORY_DESCRIPTIONS,
  SEARCH_REPOSITORY_IDS,
  SEARCH_REPOSITORY_SETTING_IDS,
  SEARCH_REPOSITORY_LABELS,
  VIEW_SETTING_DESCRIPTIONS,
  VIEW_SETTING_KEYS,
  VIEW_SETTING_LABELS,
  type SearchRepositoryId,
  type ViewSettingKey,
} from '../settings-catalog.js';

export {
  SEARCH_REPOSITORY_IDS,
  SEARCH_REPOSITORY_SETTING_IDS,
  SEARCH_REPOSITORY_LABELS,
  SEARCH_REPOSITORY_DESCRIPTIONS,
  VIEW_SETTING_KEYS,
  VIEW_SETTING_LABELS,
  VIEW_SETTING_DESCRIPTIONS,
  type SearchRepositoryId,
  type ViewSettingKey,
};

export type BooleanSwitchDescriptor = {
  kind: 'boolean';
  name: string;
  label: string;
  description: string;
  defaultValue: boolean;
  /** Tenant has this capability in provider features (relay service status). */
  featureEnabled: boolean;
  /** UI non-interactive when tenant feature is off. */
  disabled: boolean;
};

/** Word-count threshold; missing stored setting means small-match exclusion is off. */
export type SmallMatchesNumericDescriptor = {
  kind: 'smallMatches';
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  /** Default/minimum value when the option is switched on. */
  wordThreshold: number;
  featureEnabled: boolean;
  disabled: boolean;
};

export type SwitchOptionDescriptor = BooleanSwitchDescriptor | SmallMatchesNumericDescriptor;

export type SettingsConfig = {
  searchRepositories: BooleanSwitchDescriptor[];
  viewSettings: SwitchOptionDescriptor[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function getFeaturesSimilarity(features: Record<string, unknown>): Record<string, unknown> | null {
  const sim = features.similarity;
  if (!isRecord(sim)) return null;
  return sim;
}

function readViewValue(settings: TextIntegrityServiceSettings | undefined, key: string): unknown {
  const vs = settings?.similarity?.view_settings;
  if (!vs || typeof vs !== 'object') return undefined;
  return (vs as Record<string, unknown>)[key];
}

const DEFAULT_SMALL_MATCH_WORDS = 8;
const SMALL_MATCH_MIN = 1;
const SMALL_MATCH_MAX = 20;

function getSmallMatchesWordThreshold(
  settings: TextIntegrityServiceSettings | undefined,
  featureEnabled: boolean,
): number {
  if (!featureEnabled) return DEFAULT_SMALL_MATCH_WORDS;
  const raw = readViewValue(settings, 'exclude_small_matches');
  if (isSmallMatchesViewSetting(raw)) {
    return Math.min(SMALL_MATCH_MAX, Math.max(SMALL_MATCH_MIN, Math.floor(raw.word_threshold)));
  }
  return DEFAULT_SMALL_MATCH_WORDS;
}

function getSmallMatchesEnabled(
  settings: TextIntegrityServiceSettings | undefined,
  featureEnabled: boolean,
): boolean {
  if (!featureEnabled) return false;
  const raw = readViewValue(settings, 'exclude_small_matches');
  return isSmallMatchesViewSetting(raw) ? raw.enabled : false;
}

/**
 * Builds admin descriptors: full catalog; tenant-disabled rows are disabled and show falsy values.
 */
export function deriveSettingsConfig(
  storedServiceConfiguration: Record<string, unknown> | undefined,
): SettingsConfig | null {
  if (!isRecord(storedServiceConfiguration)) return null;
  const features = storedServiceConfiguration.features;
  if (!isRecord(features)) return null;

  const similarity = getFeaturesSimilarity(features);
  if (!similarity) return null;

  const settings = storedServiceConfiguration.settings as TextIntegrityServiceSettings | undefined;

  const gen = similarity.generation_settings;
  const generationSettings = isRecord(gen) ? gen : null;

  const viewFeatRaw = similarity.view_settings;
  const viewFeatures =
    isRecord(viewFeatRaw) && !Array.isArray(viewFeatRaw)
      ? (viewFeatRaw as Record<string, unknown>)
      : null;

  const tenantRepoSet = new Set<string>();
  if (generationSettings != null && Array.isArray(generationSettings.search_repositories)) {
    for (const id of generationSettings.search_repositories as unknown[]) {
      if (typeof id === 'string') tenantRepoSet.add(id);
    }
  }

  const reposList = settings?.similarity?.generation_settings?.search_repositories;
  const savedRepos = new Set(reposList ?? []);

  const searchRepositories: BooleanSwitchDescriptor[] = [];
  for (const id of SEARCH_REPOSITORY_SETTING_IDS) {
    const featureEnabled = tenantRepoSet.has(id);
    let defaultValue: boolean;
    if (!featureEnabled) {
      defaultValue = false;
    } else if (reposList == null) {
      defaultValue = true;
    } else {
      defaultValue = savedRepos.has(id);
    }

    searchRepositories.push({
      kind: 'boolean',
      name: `search_repo_${id}`,
      label: SEARCH_REPOSITORY_LABELS[id as SearchRepositoryId],
      description: SEARCH_REPOSITORY_DESCRIPTIONS[id as SearchRepositoryId],
      defaultValue,
      featureEnabled,
      disabled: !featureEnabled,
    });
  }

  const viewDescriptors: SwitchOptionDescriptor[] = [];
  for (const key of VIEW_SETTING_KEYS) {
    const featureEnabled = viewFeatures != null && viewFeatures[key] === true;
    if (key === 'exclude_small_matches') {
      viewDescriptors.push({
        kind: 'smallMatches',
        name: 'exclude_small_matches',
        label: VIEW_SETTING_LABELS[key],
        description: VIEW_SETTING_DESCRIPTIONS[key],
        enabled: getSmallMatchesEnabled(settings, featureEnabled),
        wordThreshold: getSmallMatchesWordThreshold(settings, featureEnabled),
        featureEnabled,
        disabled: !featureEnabled,
      });
      continue;
    }
    const v = readViewValue(settings, key);
    const boolVal = v === true;
    viewDescriptors.push({
      kind: 'boolean',
      name: key,
      label: VIEW_SETTING_LABELS[key],
      description: VIEW_SETTING_DESCRIPTIONS[key],
      defaultValue: featureEnabled ? boolVal : false,
      featureEnabled,
      disabled: !featureEnabled,
    });
  }

  return {
    searchRepositories,
    viewSettings: viewDescriptors,
  };
}
