import type { ReactNode } from 'react';
import { cn } from '@curvenote/scms-core';
import { CircleX, Eye, Hourglass, type LucideIcon } from 'lucide-react';
import type { ProofigDataSchema } from '../schema.js';
import {
  getProofigWorkListCompactSummaryState,
  getProofigWorkListSummaryState,
  type ProofigWorkListProgressIcon,
  type ProofigWorkListProgressState,
  type ProofigWorkListResultState,
} from './proofigWorkListSummaryState.js';
import { ProofigSummaryTitle } from './ProofigSummaryTitle.js';
import { ProofigResultSegmentBar } from './ProofigResultSegmentBar.js';

type ProofigWorkListSummaryProps = {
  metadata: ProofigDataSchema | undefined;
  compact?: boolean;
};

const PROGRESS_ICONS: Record<ProofigWorkListProgressIcon, LucideIcon> = {
  hourglass: Hourglass,
  eye: Eye,
  'circle-x': CircleX,
};

export const WORK_LIST_SUMMARY_ROW_HEIGHT_CLASS = 'h-5';
export const WORK_LIST_SUMMARY_COMPACT_ROW_HEIGHT_CLASS = 'h-4';

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

function ProofigWorkListSummaryLogo({
  metadata,
  compact,
}: {
  metadata: ProofigDataSchema | undefined;
  compact: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-0 shrink-0 items-center self-center opacity-90',
        compact && 'h-4',
        compact ? 'max-w-24' : 'max-w-28',
      )}
    >
      <ProofigSummaryTitle
        metadata={metadata}
        className={compact ? 'h-3 max-w-[7.5rem]' : 'h-4 max-w-[9rem]'}
      />
    </span>
  );
}

function ProofigWorkListStatusSegment({
  label,
  countLabel,
  icon,
  iconClassName,
  iconStrokeWidth,
  showLabel = true,
  compact = false,
}: ProofigWorkListProgressState & { showLabel?: boolean; compact?: boolean }) {
  const Icon = PROGRESS_ICONS[icon];

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
          aria-label={showLabel ? undefined : countLabel ? `${countLabel} ${label}` : label}
        />
      </span>
      {showLabel ? (
        <span className="inline-flex h-3.5 items-center gap-1 small-caps text-sm font-medium leading-none whitespace-nowrap">
          {countLabel ? <span className="tabular-nums text-warning">{countLabel}</span> : null}
          <span className="text-muted-foreground">{label}</span>
        </span>
      ) : null}
    </span>
  );
}

function ProofigWorkListResultSegment({
  state,
  compact = false,
}: {
  state: ProofigWorkListResultState;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className="inline-flex h-4 shrink-0 flex-col items-center justify-center gap-0.5 leading-none">
        {state.countLabel ? (
          <span
            className={cn(
              'font-semibold tabular-nums text-[10px] leading-none',
              state.countClassName ?? 'text-foreground',
            )}
          >
            {state.countLabel}
          </span>
        ) : (
          <span className="small-caps font-medium text-[10px] leading-none text-foreground whitespace-nowrap">
            ok
          </span>
        )}
        <span className={cn('h-0.5 w-full min-w-3 rounded-full', state.segmentFillClassName)} />
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit shrink-0 flex-col items-stretch justify-center gap-0.5 leading-none">
      <span className="inline-flex h-3.5 items-center gap-1 whitespace-nowrap leading-none">
        {state.countLabel ? (
          <span
            className={cn(
              'text-sm font-semibold tabular-nums leading-none',
              state.countClassName ?? 'text-foreground',
            )}
          >
            {state.countLabel}
          </span>
        ) : null}
        <span className="small-caps text-sm font-medium leading-none text-muted-foreground">
          {state.label}
        </span>
      </span>
      <ProofigResultSegmentBar
        filledSegments={state.filledSegments}
        segmentCount={state.segmentCount}
        fillClassName={state.segmentFillClassName}
        className="h-[3px] w-full shrink-0"
      />
    </span>
  );
}

function ProofigWorkListDivider({ compact = false }: { compact?: boolean }) {
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

export function ProofigWorkListSummary({ metadata, compact = false }: ProofigWorkListSummaryProps) {
  const state = getProofigWorkListSummaryState(metadata);

  if (state.kind === 'progress') {
    return (
      <WorkListSummaryRow compact={compact}>
        <ProofigWorkListStatusSegment {...state} showLabel={!compact} compact={compact} />
        <ProofigWorkListDivider compact={compact} />
        <ProofigWorkListSummaryLogo metadata={metadata} compact={compact} />
      </WorkListSummaryRow>
    );
  }

  const compactState = compact ? getProofigWorkListCompactSummaryState(metadata) : null;
  const resultState = compact && compactState?.kind === 'result' ? compactState : state;

  return (
    <WorkListSummaryRow compact={compact}>
      <ProofigWorkListResultSegment state={resultState} compact={compact} />
      <ProofigWorkListDivider compact={compact} />
      <ProofigWorkListSummaryLogo metadata={metadata} compact={compact} />
    </WorkListSummaryRow>
  );
}
