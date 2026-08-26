import { isSmallMatchesViewSetting, type TextIntegrityServiceSettings } from './config.server.js';
import { SEARCH_REPOSITORY_SETTING_IDS } from '../settings-catalog.js';

type AnonymousReportPayload = {
  report: {
    searchRepositories?: string[];
    autoExcludeSelfMatchingScope?: 'NONE' | 'ALL';
    addToIndex?: boolean;
    view?: Record<string, boolean | number>;
  };
};

const SMALL_MATCH_MIN = 1;

export type TextIntegrityRelayContextEnvelope = {
  v: 1;
  payload: AnonymousReportPayload;
};

function mapViewSettingsToAnonymousPayload(
  settings: TextIntegrityServiceSettings | undefined,
): Record<string, boolean | number> | undefined {
  const raw = settings?.similarity?.view_settings;
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, boolean | number> = {};
  const pairs: Array<[string, string]> = [
    ['exclude_quotes', 'excludeQuotes'],
    ['exclude_bibliography', 'excludeBibliography'],
    ['exclude_abstract', 'excludeAbstract'],
    ['exclude_methods', 'excludeMethods'],
    ['exclude_small_matches', 'excludeSmallMatches'],
    ['exclude_internet', 'excludeInternet'],
    ['exclude_publications', 'excludePublications'],
    ['exclude_citations', 'excludeCitations'],
    ['exclude_preprints', 'excludePreprints'],
    ['exclude_custom_sections', 'excludeCustomSections'],
    ['exclude_submitted_works', 'excludeSubmittedWorks'],
  ];
  for (const [sourceKey, targetKey] of pairs) {
    const v = raw[sourceKey];
    if (sourceKey === 'exclude_small_matches') {
      if (isSmallMatchesViewSetting(v) && v.enabled) {
        out[targetKey] = Math.max(SMALL_MATCH_MIN, Math.floor(v.word_threshold));
      }
      continue;
    }
    if (typeof v === 'boolean') out[targetKey] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function buildRelayContextEnvelope(
  settings: TextIntegrityServiceSettings | undefined,
): TextIntegrityRelayContextEnvelope | undefined {
  const report: AnonymousReportPayload['report'] = {};
  const generation = settings?.similarity?.generation_settings;
  if (Array.isArray(generation?.search_repositories)) {
    report.searchRepositories = generation.search_repositories.filter(
      (repo): repo is string =>
        typeof repo === 'string' &&
        (SEARCH_REPOSITORY_SETTING_IDS as readonly string[]).includes(repo),
    );
  }
  if (generation?.auto_exclude_self_matching_scope != null) {
    report.autoExcludeSelfMatchingScope = generation.auto_exclude_self_matching_scope;
  }
  if (settings?.indexing_settings?.add_to_index != null) {
    report.addToIndex = settings.indexing_settings.add_to_index === true;
  }
  const view = mapViewSettingsToAnonymousPayload(settings);
  if (view) report.view = view;
  if (Object.keys(report).length === 0) return undefined;
  return { v: 1, payload: { report } };
}
