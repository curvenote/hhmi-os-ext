// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { buildClonedPmcSubmissionMetadata } from '../src/backend/versions/clone.server.js';

describe('buildClonedPmcSubmissionMetadata', () => {
  it('copies emailProcessing.manuscriptId onto the new submission version metadata', () => {
    const result = buildClonedPmcSubmissionMetadata({
      pmc: {
        emailProcessing: {
          manuscriptId: 'NIHMS123',
        },
      },
    } as any);

    expect(result.pmc?.emailProcessing?.manuscriptId).toBe('NIHMS123');
  });

  it('copies top-level pmc.manuscriptId when emailProcessing is absent', () => {
    const result = buildClonedPmcSubmissionMetadata({
      pmc: { manuscriptId: 'NIHMS456' },
    });

    expect(result.pmc?.emailProcessing?.manuscriptId).toBe('NIHMS456');
  });

  it('leaves pmc empty when source has no manuscriptId', () => {
    expect(buildClonedPmcSubmissionMetadata({ pmc: {} })).toEqual({ pmc: {} });
    expect(buildClonedPmcSubmissionMetadata(null)).toEqual({ pmc: {} });
    expect(buildClonedPmcSubmissionMetadata(undefined)).toEqual({ pmc: {} });
  });
});
