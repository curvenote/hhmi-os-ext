import type { ReactNode } from 'react';
import { ui } from '@curvenote/scms-core';
import { StageStartedRelative } from '../StageStartedRelative.js';

export function StageProgressArea({
  step,
  numSteps,
  state,
  message,
  stageStartedAt,
  label,
  addSuffix,
  trailingSlot,
}: {
  step: number;
  numSteps: number;
  state?: 'default' | 'error' | 'success';
  message?: string;
  /** When set, shows a live-updating “Started … ago” line instead of `message`. */
  stageStartedAt?: string;
  label?: string;
  addSuffix?: boolean;
  trailingSlot?: ReactNode;
}) {
  const subline =
    stageStartedAt != null && stageStartedAt !== '' ? (
      <StageStartedRelative isoTimestamp={stageStartedAt} label={label} addSuffix={addSuffix} />
    ) : (
      (message ?? null)
    );

  return (
    <div className="space-y-1 w-full">
      <ui.SegmentedProgressBar progress={step} numSteps={numSteps} state={state} />
      {subline != null ? (
        <div className={trailingSlot ? 'flex items-center justify-between gap-3' : undefined}>
          <div className="text-xs text-left text-muted-foreground flex-1 min-w-0">{subline}</div>
          {trailingSlot ? <div className="shrink-0 -my-1">{trailingSlot}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
