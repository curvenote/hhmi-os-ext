import { useEffect, useMemo, useState } from 'react';

/** If the check run row was not updated within this window, show refresh / stale UI. */
const DEFAULT_STALE_AFTER_MS = 30_000;
/** Recompute “now vs last modified” periodically so the UI flips without a navigation. */
const STALE_RECHECK_MS = 5000;

type UseCheckRunStaleOptions = {
  staleAfterMs?: number;
};

/**
 * True when `checkRunDateModified` (ISO from `CheckServiceRun.date_modified`) is older than
 * the configured stale threshold relative to the current time.
 */
export function useCheckRunStale(
  checkRunDateModified: string | undefined,
  options: UseCheckRunStaleOptions = {},
): boolean {
  const [tick, setTick] = useState(0);
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  useEffect(() => {
    if (!checkRunDateModified) return;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, STALE_RECHECK_MS);
    return () => window.clearInterval(id);
  }, [checkRunDateModified]);

  return useMemo(() => {
    if (!checkRunDateModified) return false;
    const modifiedMs = new Date(checkRunDateModified).getTime();
    if (Number.isNaN(modifiedMs)) return false;
    return Date.now() - modifiedMs > staleAfterMs;
  }, [checkRunDateModified, staleAfterMs, tick]);
}
