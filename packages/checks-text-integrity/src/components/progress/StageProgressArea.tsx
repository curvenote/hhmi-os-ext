import type { ReactNode } from 'react';
import { SegmentedProgressBar, type PipelineSegmentTone } from '../SegmentedProgressBar.js';

export function StageProgressArea({
  step,
  numSteps,
  state,
  message,
  trailingSlot,
  segmentTones,
}: {
  step?: number;
  /** When set, renders each segment by outcome (e.g. error summary); omit `step` / `state`. */
  segmentTones?: PipelineSegmentTone[];
  numSteps: number;
  state?: 'default' | 'error' | 'success';
  message: string;
  /** Rendered on the same row as the caption (e.g. refresh link) — avoids a separate spaced block below. */
  trailingSlot?: ReactNode;
}) {
  return (
    <div className="space-y-1 w-full">
      <SegmentedProgressBar
        numSteps={numSteps}
        segmentTones={segmentTones}
        progress={segmentTones != null ? undefined : step}
        state={segmentTones != null ? undefined : state}
      />
      {trailingSlot ? (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-left text-muted-foreground flex-1 min-w-0">{message}</div>
          <div className="shrink-0 -my-1">{trailingSlot}</div>
        </div>
      ) : (
        <div>
          <div className="text-xs text-left text-muted-foreground">{message}</div>
        </div>
      )}
    </div>
  );
}
