import { cn, plural } from '@curvenote/scms-core';
import type { ProofigResultDisplayState } from '../utils/proofigSummary.js';

export interface CheckItemHeadlineProps {
  colors: {
    problem: string;
    clear: string;
    review: string;
  };
  displayState: ProofigResultDisplayState;
  /**
   * Noun fragment for `plural()` count phrases, e.g. `figure(s)` → "1 figure", "2 figures".
   * @default 'figure(s)'
   */

  countedItemPlural?: string;
}

export interface CheckItemHeadlineStats {
  value: number;
  label: string;
  textColor: string;
  borderColor: string;
}

function FractionalDisplay({
  denominator,
  numerator,
  className,
  label,
}: {
  denominator: number;
  numerator: number;
  /** When set, replaces the default `text-3xl` wrapper classes (include size/color as needed). */
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn('text-3xl font-medium text-gray-900 dark:text-gray-100', className)}>
      {numerator}
      <span className={cn('text-gray-500', className, 'font-extralight')}>/{denominator}</span>
      {label ? ` ${label}` : ''}
    </div>
  );
}

export function CheckItemHeadline({
  colors,
  displayState,
  countedItemPlural = 'sub-image(s)',
}: CheckItemHeadlineProps) {
  const {
    total,
    matchesNotBad,
    matchesReport: matchedProblems,
    inspectsReport: inspectedProblems,
  } = displayState.counts;

  if (displayState.kind === 'awaiting-review') {
    return (
      <div className="space-y-1">
        <div className="flex gap-2 items-center">
          <FractionalDisplay
            numerator={matchesNotBad}
            denominator={total}
            className={colors.review}
          />
          <div className={`text-3xl font-medium ${colors.review}`}>Awaiting review</div>
        </div>
        <div className="text-muted-foreground">
          {`${plural('(An|Some) sub-image(s) (has|have) been flagged ', matchedProblems)}`}by
          Proofig, these should be reviewed and any confirmed problems added to the report.
        </div>
      </div>
    );
  }

  if (displayState.kind === 'all-clear') {
    return (
      <div className="space-y-1">
        <div className={`text-3xl font-medium ${colors.clear}`}>All Clear</div>
        <div className="text-muted-foreground">
          {plural(`No issues found with %s ${countedItemPlural}`, total, { 0: 'your' })}
        </div>
      </div>
    );
  }

  if (displayState.kind === 'manual-problems') {
    return (
      <div className="space-y-1">
        <div className={`flex text-3xl font-medium ${colors.problem}`}>
          {plural('%s Problem(s)', inspectedProblems)}
        </div>
        <div className="text-muted-foreground">
          {plural(
            'No issues found by Proofig but %s problem(s) found by manual inspection',
            inspectedProblems,
          )}
        </div>
      </div>
    );
  }

  if (displayState.kind === 'confirmed-all-clear') {
    return (
      <div className="space-y-1">
        <div className={`text-3xl font-medium ${colors.clear}`}>Confirmed All Clear</div>
        <div className="text-muted-foreground">
          Potential issues were flagged by Proofig but none were confirmed as problems during
          review.
        </div>
      </div>
    );
  }

  if (matchedProblems > 0 && inspectedProblems === 0) {
    return (
      <div className="space-y-1">
        <div className={`flex text-3xl font-medium ${colors.problem}`}>
          {plural('%s Problem(s)', matchedProblems)}
        </div>
        <div className="text-muted-foreground">
          {plural(
            '%s sub-image(s) flagged by Proofig (was|were) confirmed as having (a|) problem(s)',
            matchedProblems,
          )}
          .
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className={`flex text-3xl font-medium ${colors.problem}`}>
        {plural('%s Problem(s)', matchedProblems + inspectedProblems)}
      </div>
      <div className="text-muted-foreground">
        {plural(
          '%s sub-image(s) flagged by Proofig (was|were) confirmed as having (a|) problem(s)',
          matchedProblems,
        )}
        , {plural('%s additional sub-image(s) (has|have) problems', inspectedProblems)} found by
        manual inspection.
      </div>
    </div>
  );
}
