export type SmallMatchesViewSetting = {
  enabled: boolean;
  word_threshold: number;
};

export function isSmallMatchesViewSetting(value: unknown): value is SmallMatchesViewSetting {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).enabled === 'boolean' &&
    typeof (value as Record<string, unknown>).word_threshold === 'number' &&
    Number.isFinite((value as Record<string, unknown>).word_threshold)
  );
}

export type TextIntegrityViewSettingValue = boolean | SmallMatchesViewSetting;

/** Admin-editable defaults (generation_settings + view_settings only). */
export interface TextIntegrityDefaults {
  similarity?: {
    generation_settings?: {
      search_repositories?: string[];
      submission_auto_excludes?: boolean;
    };
    view_settings?: Record<string, TextIntegrityViewSettingValue>;
  };
}

/** Persisted admin settings for text integrity (Object row + merged extension config). */
export interface TextIntegrityServiceSettings {
  indexing_settings?: {
    add_to_index?: boolean;
  };
  similarity?: {
    generation_settings?: {
      search_repositories?: string[];
      auto_exclude_self_matching_scope?: 'NONE' | 'ALL';
    };
    view_settings?: Record<string, TextIntegrityViewSettingValue>;
  };
}
