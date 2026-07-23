import type { FetcherWithComponents } from 'react-router';

export function shouldResetReplaceExistingData(
  hasSubmitted: boolean,
  fetcherState: FetcherWithComponents<unknown>['state'],
): boolean {
  return hasSubmitted && fetcherState === 'idle';
}
