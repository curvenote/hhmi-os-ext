import type { ReactNode } from 'react';
import { cn } from '@curvenote/scms-core';
import { CircleX, Hourglass, type LucideIcon } from 'lucide-react';
import type { TextIntegrityDataSchema } from '../schema.js';
import { canShowResults, hasError } from '../schema.js';
import {
  SIMILARITY_BAR_MIN_FILL_PERCENT,
  SimilarityPercentageBar,
  similarityScoreBarColorClass,
  similarityScoreTextColorClass,
} from './SimilarityPercentageBar.js';
import { TextIntegritySummaryTitle } from './TextIntegritySummaryTitle.js';

type TextIntegrityWorkListSummaryProps = {
  metadata: TextIntegrityDataSchema | undefined;
  compact?: boolean;
};

type TextIntegrityWorkListStatus = {
  label: string;
  Icon: LucideIcon;
  iconClassName: string;
  iconStrokeWidth?: number;
};

function getTextIntegrityWorkListStatus(
  metadata: TextIntegrityDataSchema | undefined,
): TextIntegrityWorkListStatus {
  if (!metadata?.stages) {
    return {
      label: 'pending',
      Icon: Hourglass,
      iconClassName: 'text-warning',
      iconStrokeWidth: 2.5,
    };
  }
  if (hasError(metadata)) {
    return { label: 'error', Icon: CircleX, iconClassName: 'text-destructive' };
  }
  return {
    label: 'in progress',
    Icon: Hourglass,
    iconClassName: 'text-warning',
    iconStrokeWidth: 2.5,
  };
}

export const WORK_LIST_SUMMARY_ROW_HEIGHT_CLASS = 'h-5';
export const WORK_LIST_SUMMARY_COMPACT_ROW_HEIGHT_CLASS = 'h-4';

function TextIntegrityWorkListStatusSegment({
  label,
  Icon,
  iconClassName,
  iconStrokeWidth,
  showLabel = true,
  compact = false,
}: TextIntegrityWorkListStatus & { showLabel?: boolean; compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 leading-none',
        compact ? WORK_LIST_SUMMARY_COMPACT_ROW_HEIGHT_CLASS : WORK_LIST_SUMMARY_ROW_HEIGHT_CLASS,
      )}
    >
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        <Icon
          className={cn('block size-3.5', iconClassName)}
          strokeWidth={iconStrokeWidth}
          aria-hidden={showLabel}
          aria-label={showLabel ? undefined : label}
        />
      </span>
      {showLabel ? (
        <span className="inline-flex h-3.5 items-center small-caps text-sm font-medium leading-none whitespace-nowrap text-muted-foreground">
          {label}
        </span>
      ) : null}
    </span>
  );
}

function TextIntegrityWorkListSimilarityResult({
  overall,
  compact = false,
}: {
  overall: number;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className="inline-flex h-4 shrink-0 flex-col items-center justify-center gap-0.5 leading-none">
        <span
          className={cn(
            'font-semibold tabular-nums text-[10px]',
            similarityScoreTextColorClass(overall),
          )}
        >
          {overall}%
        </span>
        <span className={cn('h-0.5 w-full rounded-full', similarityScoreBarColorClass(overall))} />
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit shrink-0 flex-col items-stretch justify-center gap-0.5 leading-none">
      <span className="inline-flex h-3.5 items-center gap-1 whitespace-nowrap leading-none">
        <span
          className={cn(
            'text-sm font-semibold tabular-nums leading-none',
            similarityScoreTextColorClass(overall),
          )}
        >
          {overall}%
        </span>
        <span className="small-caps text-sm font-medium leading-none text-muted-foreground">
          similarity
        </span>
      </span>
      <SimilarityPercentageBar
        percentage={overall}
        minFillPercent={SIMILARITY_BAR_MIN_FILL_PERCENT}
        className="h-[3px] w-full shrink-0"
      />
    </span>
  );
}

function TextIntegrityWorkListSummaryLogo({
  metadata,
  compact,
}: TextIntegrityWorkListSummaryProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 shrink-0 items-center self-center opacity-90',
        compact ? WORK_LIST_SUMMARY_COMPACT_ROW_HEIGHT_CLASS : WORK_LIST_SUMMARY_ROW_HEIGHT_CLASS,
        compact ? 'max-w-24' : 'max-w-28',
      )}
    >
      <TextIntegritySummaryTitle
        metadata={metadata}
        className={compact ? 'h-2 max-w-[6.5rem]' : 'h-2.5 max-w-[7.5rem]'}
      />
    </span>
  );
}

function WorkListSummaryRow({ compact, children }: { compact: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center leading-none',
        compact
          ? `${WORK_LIST_SUMMARY_COMPACT_ROW_HEIGHT_CLASS} gap-1`
          : `${WORK_LIST_SUMMARY_ROW_HEIGHT_CLASS} gap-1.5`,
      )}
    >
      {children}
    </span>
  );
}

function TextIntegrityWorkListDivider({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center self-center text-muted-foreground',
        compact ? WORK_LIST_SUMMARY_COMPACT_ROW_HEIGHT_CLASS : WORK_LIST_SUMMARY_ROW_HEIGHT_CLASS,
      )}
      aria-hidden
    >
      |
    </span>
  );
}

export function TextIntegrityWorkListSummary({
  metadata,
  compact = false,
}: TextIntegrityWorkListSummaryProps) {
  if (canShowResults(metadata) && metadata?.summaryReport) {
    const overall = metadata.summaryReport.overallMatchPercentage ?? 0;
    return (
      <WorkListSummaryRow compact={compact}>
        <TextIntegrityWorkListSimilarityResult overall={overall} compact={compact} />
        <TextIntegrityWorkListDivider compact={compact} />
        <TextIntegrityWorkListSummaryLogo metadata={metadata} compact={compact} />
      </WorkListSummaryRow>
    );
  }

  const { label, Icon, iconClassName, iconStrokeWidth } = getTextIntegrityWorkListStatus(metadata);

  return (
    <WorkListSummaryRow compact={compact}>
      <TextIntegrityWorkListStatusSegment
        label={label}
        Icon={Icon}
        iconClassName={iconClassName}
        iconStrokeWidth={iconStrokeWidth}
        showLabel={!compact}
        compact={compact}
      />
      <TextIntegrityWorkListDivider compact={compact} />
      <TextIntegrityWorkListSummaryLogo metadata={metadata} compact={compact} />
    </WorkListSummaryRow>
  );
}
