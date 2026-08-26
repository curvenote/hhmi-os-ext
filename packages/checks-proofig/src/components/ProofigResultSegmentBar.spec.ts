// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import {
  PROOFIG_RESULT_PROBLEMS_SEGMENT_COUNT,
  proofigResultFilledSegmentCount,
} from './ProofigResultSegmentBar.js';

describe('proofigResultFilledSegmentCount', () => {
  it('caps filled segments at the provided segment count', () => {
    expect(proofigResultFilledSegmentCount(25, PROOFIG_RESULT_PROBLEMS_SEGMENT_COUNT)).toBe(
      PROOFIG_RESULT_PROBLEMS_SEGMENT_COUNT,
    );
  });

  it('maps problem counts directly below the cap', () => {
    expect(proofigResultFilledSegmentCount(2, PROOFIG_RESULT_PROBLEMS_SEGMENT_COUNT)).toBe(2);
  });
});
