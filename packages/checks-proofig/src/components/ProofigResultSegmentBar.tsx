import { cn } from '@curvenote/scms-core';

export const PROOFIG_RESULT_ALL_CLEAR_SEGMENT_COUNT = 11;
export const PROOFIG_RESULT_PROBLEMS_SEGMENT_COUNT = 13;
export const PROOFIG_RESULT_SEGMENT_EMPTY_CLASS = 'bg-gray-200 dark:bg-gray-700';

type ProofigResultSegmentBarProps = {
  filledSegments: number;
  segmentCount: number;
  fillClassName: string;
  compact?: boolean;
  className?: string;
};

export function proofigResultFilledSegmentCount(count: number, segmentCount: number): number {
  return Math.min(segmentCount, Math.max(0, count));
}

export function ProofigResultSegmentBar({
  filledSegments,
  segmentCount,
  fillClassName,
  compact = false,
  className,
}: ProofigResultSegmentBarProps) {
  const filled = proofigResultFilledSegmentCount(filledSegments, segmentCount);

  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center leading-none',
        compact ? 'gap-px' : 'gap-0.5',
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: segmentCount }, (_, index) => (
        <span
          key={index}
          className={cn(
            'size-[3px] shrink-0 rounded-[1px]',
            index < filled ? fillClassName : PROOFIG_RESULT_SEGMENT_EMPTY_CLASS,
          )}
        />
      ))}
    </span>
  );
}
