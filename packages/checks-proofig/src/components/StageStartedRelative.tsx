import { formatDistanceToNow } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';

/**
 * Renders "Started … ago" relative to an ISO timestamp, updating every second.
 */
export function StageStartedRelative({
  isoTimestamp,
  label,
  addSuffix,
}: {
  isoTimestamp: string;
  label?: string;
  addSuffix?: boolean;
}) {
  const started = useMemo(() => new Date(isoTimestamp), [isoTimestamp]);
  const valid = !Number.isNaN(started.getTime());
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!valid) {
    return null;
  }

  const distance = formatDistanceToNow(started, {
    addSuffix: addSuffix ?? true,
    includeSeconds: true,
  });

  return (
    <>
      {label ?? 'Started'} {distance}
    </>
  );
}
