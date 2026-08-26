import { cn } from '@curvenote/scms-core';

/**
 * Bar fill + timeline chromatic-outline badge for one similarity tier.
 * Matches scms-core Badge `primary` (border + text + bg/5, hover bg/10), as Proofig uses for in-progress;
 * tier colors stay on the similarity scale.
 */
function similarityScorePalette(percentage: number): {
  barBg: string;
  textColor: string;
  /** Overrides `primary` badge tint colors; use with `ui.Badge variant="primary"`. */
  outlineBadge: string;
} {
  const p = Number.isFinite(percentage) ? percentage : 0;
  if (p < 1)
    return {
      barBg: 'bg-emerald-800',
      textColor: 'text-emerald-800',
      outlineBadge:
        'border-emerald-800 text-emerald-800 bg-emerald-800/5 [a&]:hover:bg-emerald-800/10',
    };
  if (p < 24)
    return {
      barBg: 'bg-blue-600',
      textColor: 'text-blue-600',
      outlineBadge: 'border-blue-600 text-blue-600 bg-blue-600/5 [a&]:hover:bg-blue-600/10',
    };
  if (p < 50)
    return {
      barBg: 'bg-amber-700',
      textColor: 'text-amber-700',
      outlineBadge: 'border-amber-700 text-amber-700 bg-amber-700/5 [a&]:hover:bg-amber-700/10',
    };
  if (p < 75)
    return {
      barBg: 'bg-orange-600',
      textColor: 'text-orange-600',
      outlineBadge: 'border-orange-600 text-orange-600 bg-orange-600/5 [a&]:hover:bg-orange-600/10',
    };
  return {
    barBg: 'bg-red-600',
    textColor: 'text-red-600',
    outlineBadge: 'border-red-600 text-red-600 bg-red-600/5 [a&]:hover:bg-red-600/10',
  };
}

/**
 * Tailwind background class for a similarity percentage, per product ranges:
 * green under 1%, blue 1–23%, yellow 24–49%, orange 50–74%, red 75–100%.
 */
export function similarityScoreBarColorClass(percentage: number): string {
  return similarityScorePalette(percentage).barBg;
}

/** Text color class for a similarity percentage, matching the tier bar color. */
export function similarityScoreTextColorClass(percentage: number): string {
  return similarityScorePalette(percentage).textColor;
}

export const SIMILARITY_BAR_MIN_FILL_PERCENT = 6;

/**
 * Same palette as the similarity bars, for solid pills with readable contrast.
 */
export function similarityScoreSolidBadgeClassName(percentage: number): string {
  return cn(
    'border-transparent text-white [a&]:hover:opacity-90',
    similarityScorePalette(percentage).barBg,
  );
}

/**
 * Chromatic outline badge: same layout as `ui.Badge variant="primary"` (Proofig processing style),
 * with similarity tier colors. Pass as `className` together with `variant="primary"`.
 */
export function similarityScoreOutlineBadgeClassName(percentage: number): string {
  return similarityScorePalette(percentage).outlineBadge;
}

function clampWidthPercent(percentage: number): number {
  const p = Number.isFinite(percentage) ? percentage : 0;
  return Math.min(100, Math.max(0, p));
}

/** Bar fill width with an optional minimum floor (e.g. 6% for work-list badges). */
export function similarityScoreBarFillWidthPercent(percentage: number, minFillPercent = 0): number {
  const p = clampWidthPercent(percentage);
  return Math.max(minFillPercent, p);
}

interface SimilarityPercentageBarProps {
  percentage: number;
  className?: string;
  trackClassName?: string;
  minFillPercent?: number;
}

/**
 * Horizontal “progress” bar: fill width is the score as a % of the container; color follows {@link similarityScoreBarColorClass}.
 */
export function SimilarityPercentageBar({
  percentage,
  className,
  trackClassName,
  minFillPercent = 0,
}: SimilarityPercentageBarProps) {
  const widthPct = similarityScoreBarFillWidthPercent(percentage, minFillPercent);
  const colorClass = similarityScoreBarColorClass(percentage);

  return (
    <div
      className={cn(
        'h-[4px] w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700',
        trackClassName,
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clampWidthPercent(percentage))}
      aria-label={`Similarity ${clampWidthPercent(percentage)}%`}
    >
      <div
        className={cn('h-full duration-300 transition-[width]', colorClass)}
        style={{ width: `${widthPct}%` }}
      />
    </div>
  );
}
