import type { CheckRunCoarseStatus } from './types.js';

/** True when coarse status newly entered error (not already errored). */
export function shouldNotifyErrorTransition(
  beforeStatus: CheckRunCoarseStatus | null | undefined,
  afterStatus: CheckRunCoarseStatus | null | undefined,
): boolean {
  if (afterStatus !== 'error') return false;
  return beforeStatus !== 'error';
}
