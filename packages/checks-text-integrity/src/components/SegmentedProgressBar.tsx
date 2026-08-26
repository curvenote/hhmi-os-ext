import { cn } from '@curvenote/scms-core';

type ProgressState = 'default' | 'error' | 'success';

/** Per-segment styling when showing pipeline outcome (e.g. error summary). */
export type PipelineSegmentTone = 'complete' | 'error' | 'muted';

interface SegmentedProgressBarProps {
  numSteps: number;
  className?: string;
  /** Per-segment fills (length must equal `numSteps`). When set, `progress` / `state` are ignored. */
  segmentTones?: PipelineSegmentTone[];
  /** Legacy: 1-based index of the active step (animated / colored segment). */
  progress?: number;
  state?: ProgressState;
}

const stateColors: Record<ProgressState, { filled: string; empty: string }> = {
  default: {
    filled: 'bg-primary',
    empty: 'bg-gray-200 dark:bg-gray-700',
  },
  error: {
    filled: 'bg-red-500',
    empty: 'bg-gray-200 dark:bg-gray-700',
  },
  success: {
    filled: 'bg-green-500',
    empty: 'bg-gray-200 dark:bg-gray-700',
  },
};

const toneClass: Record<PipelineSegmentTone, string> = {
  complete: 'bg-green-500',
  error: 'bg-red-500',
  muted: 'bg-gray-200 dark:bg-gray-700',
};

export function SegmentedProgressBar({
  progress,
  numSteps,
  state = 'default',
  segmentTones,
  className,
}: SegmentedProgressBarProps) {
  if (segmentTones != null) {
    const tones: PipelineSegmentTone[] =
      segmentTones.length >= numSteps
        ? segmentTones.slice(0, numSteps)
        : [
            ...segmentTones,
            ...Array.from({ length: numSteps - segmentTones.length }, () => 'muted' as const),
          ];
    return (
      <div className={cn('flex gap-[3px]', className)}>
        {tones.map((tone: PipelineSegmentTone, index) => (
          <div
            key={index}
            className={cn(
              'overflow-hidden relative flex-1 h-2 transition-colors duration-300',
              toneClass[tone],
            )}
            aria-label={`Pipeline segment ${index + 1} of ${numSteps}`}
          />
        ))}
      </div>
    );
  }

  const clampedProgress = Math.max(0, Math.min(progress ?? 1, numSteps));
  const colors = stateColors[state];
  const completedColor = 'bg-green-500';

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div className={cn('flex gap-[3px]', className)}>
        {Array.from({ length: numSteps }, (_, index) => {
          const isCompleted = index < clampedProgress - 1;
          const isActive = index === clampedProgress - 1;
          const segmentColor = isCompleted
            ? completedColor
            : isActive
              ? colors.filled
              : colors.empty;
          return (
            <div
              key={index}
              className={cn(
                'overflow-hidden relative flex-1 h-2 transition-colors duration-1000',
                segmentColor,
              )}
              aria-label={`Step ${index + 1} of ${numSteps}${isCompleted ? ' - completed' : isActive ? ' - active' : ''}`}
            >
              {isActive && state === 'default' && (
                <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent to-transparent via-white/50"
                  style={{ animation: 'shimmer 2s ease-in-out infinite' }}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
