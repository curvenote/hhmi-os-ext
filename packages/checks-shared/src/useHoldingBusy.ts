import { useEffect, useState } from 'react';

/**
 * Release latch if CTA→progress never arrives (stalled success).
 * Run-check execute actions must return a truthy JSON body on success (e.g. `{ success: true }`);
 * empty settle does not release early — the timeout is the safety valve.
 */
export const HOLDING_BUSY_TIMEOUT_MS = 15_000;

type FetcherLike = {
  state: string;
  data: unknown;
};

export type UseHoldingBusyOptions = {
  fetcher: FetcherLike;
  /** Release when progress is shown while the submit control stays mounted. */
  releaseWhen?: boolean;
  /** Invoked when the fetcher settles with a structured `{ error: { message } }` body. */
  onSettledError?: (message: string) => void;
  timeoutMs?: number;
};

export function useHoldingBusy({
  fetcher,
  releaseWhen = false,
  onSettledError,
  timeoutMs = HOLDING_BUSY_TIMEOUT_MS,
}: UseHoldingBusyOptions): boolean {
  const [holdingBusy, setHoldingBusy] = useState(false);

  useEffect(() => {
    if (fetcher.state !== 'idle') setHoldingBusy(true);
  }, [fetcher.state]);

  useEffect(() => {
    if (releaseWhen) setHoldingBusy(false);
  }, [releaseWhen]);

  useEffect(() => {
    if (fetcher.state !== 'idle' || releaseWhen) return;
    if (!holdingBusy) return;
    if (!fetcher.data) return;

    const err = (fetcher.data as { error?: { message?: string } }).error;
    if (err?.message) {
      onSettledError?.(err.message);
      setHoldingBusy(false);
    }
  }, [fetcher.state, fetcher.data, releaseWhen, holdingBusy, onSettledError]);

  useEffect(() => {
    if (!holdingBusy) return;
    const to = setTimeout(() => setHoldingBusy(false), timeoutMs);
    return () => clearTimeout(to);
  }, [holdingBusy, timeoutMs]);

  return holdingBusy;
}
