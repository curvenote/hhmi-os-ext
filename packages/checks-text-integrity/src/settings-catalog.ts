/** Search repository ids from features-enabled `search_repositories` (relay service status). */
export const SEARCH_REPOSITORY_IDS = [
  'INTERNET',
  'SUBMITTED_WORK',
  'PUBLICATION',
  'CROSSREF',
  'CROSSREF_POSTED_CONTENT',
] as const;

export type SearchRepositoryId = (typeof SEARCH_REPOSITORY_IDS)[number];

export const SEARCH_REPOSITORY_SETTING_IDS = SEARCH_REPOSITORY_IDS.filter(
  (id) => id !== 'SUBMITTED_WORK',
);

export const SEARCH_REPOSITORY_LABELS: Record<SearchRepositoryId, string> = {
  INTERNET: 'Internet',
  SUBMITTED_WORK: 'Submitted Work',
  PUBLICATION: 'Publications',
  CROSSREF: 'Crossref (Publications)',
  CROSSREF_POSTED_CONTENT: 'Crossref Posted Content (Preprints)',
};
export const SEARCH_REPOSITORY_DESCRIPTIONS: Record<SearchRepositoryId, string> = {
  INTERNET:
    'Use this search repository to compare against content in the internet search repository',
  SUBMITTED_WORK: 'Use this search repository to compare against indexed submissions',
  PUBLICATION: 'Use this search repository to compare against publications',
  CROSSREF: 'Use this search repository to compare against crossref publications',
  CROSSREF_POSTED_CONTENT:
    'Use this search repository to compare against crossref posted content publications',
};

/** View-setting keys for similarity reports / admin. */
export const VIEW_SETTING_KEYS = [
  'exclude_quotes',
  'exclude_bibliography',
  'exclude_abstract',
  'exclude_methods',
  'exclude_small_matches',
  'exclude_internet',
  'exclude_publications',
  'exclude_submitted_works',
  'exclude_citations',
  'exclude_preprints',
  'exclude_custom_sections',
] as const;

export type ViewSettingKey = (typeof VIEW_SETTING_KEYS)[number];

export const VIEW_SETTING_LABELS: Record<ViewSettingKey, string> = {
  exclude_quotes: 'Exclude quotes',
  exclude_bibliography: 'Exclude bibliography',
  exclude_abstract: 'Exclude abstract',
  exclude_methods: 'Exclude methods',
  exclude_small_matches: 'Exclude small matches',
  exclude_internet: 'Exclude internet',
  exclude_publications: 'Exclude publications',
  exclude_submitted_works: 'Exclude submitted works',
  exclude_citations: 'Exclude citations',
  exclude_preprints: 'Exclude preprints',
  exclude_custom_sections: 'Exclude custom sections',
};

export const VIEW_SETTING_DESCRIPTIONS: Record<ViewSettingKey, string> = {
  exclude_quotes: 'If set to true, text in quotes will not count as similar content',
  exclude_bibliography:
    'If set to true, text in a bibliography section will not count as similar content',
  exclude_abstract:
    'If set to true, text in the abstract section of the submission will not count as similar content',
  exclude_methods:
    'If set to true, text in the method section of the submission will not count as similar content',
  exclude_small_matches:
    'If set, similarity matches that match less than the specified amount of words will not count as similar content',
  exclude_internet:
    'If set to true, text matched to the internet collection will not count as similar content',
  exclude_publications:
    'If set to true, text matched to the publications collection will not count as similar content',
  exclude_submitted_works:
    'If set to true, text matched to the submitted works collection will not count as similar content',
  exclude_citations:
    'If set to true, it will exclude citations. Using machine learning techniques we identify and exclude inline citations in the APA, MLA, and Turabian style formats.',
  exclude_preprints:
    'If set to true, it will exclude a predefined set of pre-print sources. A pre-print is a version of a scholarly or scientific paper that precedes formal peer review and publication in a peer-reviewed scholarly or scientific journal. If you have a custom source you would like to exclude, you can add it to the list of custom websites in the admin console. This setting can be overridden by our admin settings page and please check that page to ensure the pre-prints setting is configured and enabled.',
  exclude_custom_sections:
    'If set to true, text matched to the custom sections defined in the admin settings will not count as similar content',
};
