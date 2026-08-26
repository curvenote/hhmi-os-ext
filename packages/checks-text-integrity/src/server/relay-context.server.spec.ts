import { describe, expect, it } from 'vitest';
import type { TextIntegrityServiceSettings } from './config.server.js';
import { buildRelayContextEnvelope } from './relay-context.server.js';

describe('buildRelayContextEnvelope', () => {
  it('omits disabled small-match exclusion while preserving its stored threshold', () => {
    const settings = {
      similarity: {
        view_settings: {
          exclude_small_matches: {
            enabled: false,
            word_threshold: 15,
          },
        },
      },
    } as unknown as TextIntegrityServiceSettings;

    expect(buildRelayContextEnvelope(settings)).toBeUndefined();
  });

  it('serializes enabled small-match exclusion as the stored threshold', () => {
    const settings = {
      similarity: {
        view_settings: {
          exclude_small_matches: {
            enabled: true,
            word_threshold: 1,
          },
        },
      },
    } as unknown as TextIntegrityServiceSettings;

    expect(buildRelayContextEnvelope(settings)).toEqual({
      v: 1,
      payload: {
        report: {
          view: {
            excludeSmallMatches: 1,
          },
        },
      },
    });
  });
});
