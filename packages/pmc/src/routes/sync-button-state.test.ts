// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { shouldResetReplaceExistingData } from './sync-button-state.js';

describe('shouldResetReplaceExistingData', () => {
  it('does not reset on the initial idle state', () => {
    expect(shouldResetReplaceExistingData(false, 'idle')).toBe(false);
  });

  it('resets after an actual submission returns to idle', () => {
    expect(shouldResetReplaceExistingData(true, 'idle')).toBe(true);
  });

  it.each(['submitting', 'loading'] as const)(
    'does not reset while a submission is %s',
    (state) => {
      expect(shouldResetReplaceExistingData(true, state)).toBe(false);
    },
  );
});
