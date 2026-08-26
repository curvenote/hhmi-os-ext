// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { deriveSettingsConfig } from '../admin/settings-config.js';
import { buildRelayContextEnvelope } from './relay-context.server.js';
import {
  applyTextIntegritySettingPatch,
  buildDefaultSettings,
  reconcileSettingsWithFeatures,
} from './text-integrity-settings.server.js';
import type { TextIntegrityServiceSettings } from './config.server.js';

const FEATURES = {
  similarity: {
    generation_settings: {
      search_repositories: ['INTERNET', 'SUBMITTED_WORK', 'PUBLICATION'],
    },
    view_settings: {},
  },
};

const SMALL_MATCH_FEATURES = {
  similarity: {
    generation_settings: {
      search_repositories: ['INTERNET'],
    },
    view_settings: {
      exclude_quotes: true,
      exclude_small_matches: true,
    },
  },
};

describe('text integrity search repository settings', () => {
  it('defaults Submitted Work to off even when the tenant feature includes it', () => {
    const settings = buildDefaultSettings(FEATURES);

    expect(settings.similarity?.generation_settings?.search_repositories).toEqual([
      'INTERNET',
      'PUBLICATION',
    ]);
  });

  it('does not expose Submitted Work as an admin setting descriptor', () => {
    const config = deriveSettingsConfig({
      features: FEATURES,
      settings: buildDefaultSettings(FEATURES),
    });

    expect(config?.searchRepositories.map((descriptor) => descriptor.name)).toEqual([
      'search_repo_INTERNET',
      'search_repo_PUBLICATION',
      'search_repo_CROSSREF',
      'search_repo_CROSSREF_POSTED_CONTENT',
    ]);
  });

  it('rejects attempts to enable Submitted Work through setting patches', () => {
    const result = applyTextIntegritySettingPatch(
      buildDefaultSettings(FEATURES),
      FEATURES,
      'search_repo_SUBMITTED_WORK',
      'true',
    );

    expect(result).toEqual({
      ok: false,
      message: 'This search repository is fixed off',
    });
  });

  it('drops Submitted Work from reconciled settings and relay context', () => {
    const settings: TextIntegrityServiceSettings = {
      similarity: {
        generation_settings: {
          search_repositories: ['INTERNET', 'SUBMITTED_WORK', 'PUBLICATION'],
        },
      },
    };

    const reconciled = reconcileSettingsWithFeatures(settings, FEATURES);
    expect(reconciled.similarity?.generation_settings?.search_repositories).toEqual([
      'INTERNET',
      'PUBLICATION',
    ]);

    const envelope = buildRelayContextEnvelope(settings);
    expect(envelope?.payload.report.searchRepositories).toEqual(['INTERNET', 'PUBLICATION']);
  });
});

describe('text integrity exclude small matches setting', () => {
  it('omits exclude_small_matches from default settings while keeping boolean view defaults', () => {
    const settings = buildDefaultSettings(SMALL_MATCH_FEATURES);

    expect(settings.similarity?.view_settings).toEqual({
      exclude_quotes: false,
    });
  });

  it('derives an off descriptor with a default threshold of 8 when the setting is omitted', () => {
    const config = deriveSettingsConfig({
      features: SMALL_MATCH_FEATURES,
      settings: buildDefaultSettings(SMALL_MATCH_FEATURES),
    });

    const descriptor = config?.viewSettings.find((d) => d.name === 'exclude_small_matches');

    expect(descriptor).toMatchObject({
      kind: 'smallMatches',
      enabled: false,
      wordThreshold: 8,
      disabled: false,
    });
  });

  it('derives an enabled descriptor when a saved threshold is positive', () => {
    const config = deriveSettingsConfig({
      features: SMALL_MATCH_FEATURES,
      settings: {
        similarity: {
          view_settings: {
            exclude_small_matches: {
              enabled: true,
              word_threshold: 1,
            },
          },
        },
      },
    });

    const descriptor = config?.viewSettings.find((d) => d.name === 'exclude_small_matches');

    expect(descriptor).toMatchObject({
      kind: 'smallMatches',
      enabled: true,
      wordThreshold: 1,
    });
  });

  it('derives a disabled descriptor while preserving the saved threshold', () => {
    const config = deriveSettingsConfig({
      features: SMALL_MATCH_FEATURES,
      settings: {
        similarity: {
          view_settings: {
            exclude_small_matches: {
              enabled: false,
              word_threshold: 12,
            },
          },
        },
      },
    });

    const descriptor = config?.viewSettings.find((d) => d.name === 'exclude_small_matches');

    expect(descriptor).toMatchObject({
      kind: 'smallMatches',
      enabled: false,
      wordThreshold: 12,
    });
  });

  it('stores enabled separately from the default threshold when enabling with a boolean value', () => {
    const result = applyTextIntegritySettingPatch(
      buildDefaultSettings(SMALL_MATCH_FEATURES),
      SMALL_MATCH_FEATURES,
      'exclude_small_matches',
      'true',
    );

    expect(result).toEqual({
      ok: true,
      settings: expect.objectContaining({
        similarity: expect.objectContaining({
          view_settings: expect.objectContaining({
            exclude_small_matches: {
              enabled: true,
              word_threshold: 8,
            },
          }),
        }),
      }),
    });
  });

  it('updates positive thresholds up to 20 without enabling the setting and rejects larger values', () => {
    const lowerBoundUpdated = applyTextIntegritySettingPatch(
      buildDefaultSettings(SMALL_MATCH_FEATURES),
      SMALL_MATCH_FEATURES,
      'exclude_small_matches',
      '1',
    );
    const upperBoundUpdated = applyTextIntegritySettingPatch(
      buildDefaultSettings(SMALL_MATCH_FEATURES),
      SMALL_MATCH_FEATURES,
      'exclude_small_matches',
      '20',
    );
    const rejected = applyTextIntegritySettingPatch(
      buildDefaultSettings(SMALL_MATCH_FEATURES),
      SMALL_MATCH_FEATURES,
      'exclude_small_matches',
      '21',
    );

    expect(lowerBoundUpdated).toEqual({
      ok: true,
      settings: expect.objectContaining({
        similarity: expect.objectContaining({
          view_settings: expect.objectContaining({
            exclude_small_matches: {
              enabled: false,
              word_threshold: 1,
            },
          }),
        }),
      }),
    });
    expect(upperBoundUpdated).toEqual({
      ok: true,
      settings: expect.objectContaining({
        similarity: expect.objectContaining({
          view_settings: expect.objectContaining({
            exclude_small_matches: {
              enabled: false,
              word_threshold: 20,
            },
          }),
        }),
      }),
    });
    expect(rejected).toEqual({ ok: false, message: 'Invalid word threshold' });
  });

  it('disables small-match exclusion when the threshold patch is zero', () => {
    const result = applyTextIntegritySettingPatch(
      {
        similarity: {
          view_settings: {
            exclude_small_matches: {
              enabled: true,
              word_threshold: 12,
            },
          },
        },
      },
      SMALL_MATCH_FEATURES,
      'exclude_small_matches',
      '0',
    );

    expect(result).toEqual({
      ok: true,
      settings: {
        similarity: {
          view_settings: {
            exclude_small_matches: {
              enabled: false,
              word_threshold: 12,
            },
          },
        },
      },
    });
  });

  it('stores exclude_small_matches as disabled when the toggle is disabled', () => {
    const result = applyTextIntegritySettingPatch(
      {
        similarity: {
          view_settings: {
            exclude_quotes: true,
            exclude_small_matches: {
              enabled: true,
              word_threshold: 12,
            },
          },
        },
      },
      SMALL_MATCH_FEATURES,
      'exclude_small_matches',
      'false',
    );

    expect(result).toEqual({
      ok: true,
      settings: {
        similarity: {
          view_settings: {
            exclude_quotes: true,
            exclude_small_matches: {
              enabled: false,
              word_threshold: 12,
            },
          },
        },
      },
    });
  });

  it('keeps small-match exclusion disabled when a later threshold patch arrives', () => {
    const initialSettings = {
      similarity: {
        view_settings: {
          exclude_small_matches: {
            enabled: true,
            word_threshold: 12,
          },
        },
      },
    };

    const disabled = applyTextIntegritySettingPatch(
      initialSettings,
      SMALL_MATCH_FEATURES,
      'exclude_small_matches',
      'false',
    );
    expect(disabled.ok).toBe(true);

    const thresholdUpdated = applyTextIntegritySettingPatch(
      disabled.ok ? disabled.settings : initialSettings,
      SMALL_MATCH_FEATURES,
      'exclude_small_matches',
      '15',
    );

    expect(thresholdUpdated).toEqual({
      ok: true,
      settings: {
        similarity: {
          view_settings: {
            exclude_small_matches: {
              enabled: false,
              word_threshold: 15,
            },
          },
        },
      },
    });
  });

  it('omits disabled small-match values from relay context and includes enabled thresholds', () => {
    const disabled = buildRelayContextEnvelope({
      similarity: {
        view_settings: {
          exclude_small_matches: {
            enabled: false,
            word_threshold: 15,
          },
        },
      },
    });
    const enabled = buildRelayContextEnvelope({
      similarity: {
        view_settings: {
          exclude_small_matches: {
            enabled: true,
            word_threshold: 1,
          },
        },
      },
    });

    expect(disabled).toBeUndefined();
    expect(enabled?.payload.report.view).toEqual({
      excludeSmallMatches: 1,
    });
  });
});
