import type { TextIntegrityDataSchema } from '../schema.js';
import { canShowResults, hasError } from '../schema.js';
import { cn, ui } from '@curvenote/scms-core';
import { similarityScoreOutlineBadgeClassName } from './SimilarityPercentageBar.js';

interface TextIntegritySummaryBadgeProps {
  metadata: TextIntegrityDataSchema | undefined;
}

/**
 * Summary badge for timeline: stage label or result summary (X% similar).
 * Used when the platform renders a check service run item (e.g. work details timeline).
 */
export function TextIntegritySummaryBadge({ metadata }: TextIntegritySummaryBadgeProps) {
  if (!metadata?.stages) {
    return (
      <ui.Badge variant="secondary" size="xs" className="uppercase tracking-wide min-w-[80px]">
        —
      </ui.Badge>
    );
  }

  if (canShowResults(metadata) && metadata.summaryReport) {
    const overall = metadata.summaryReport.overallMatchPercentage ?? 0;
    return (
      <ui.Badge
        variant="primary"
        size="xs"
        className={cn(
          'tracking-wide uppercase min-w-[80px]',
          similarityScoreOutlineBadgeClassName(overall),
        )}
      >
        {overall}% similar
      </ui.Badge>
    );
  }

  if (hasError(metadata)) {
    return (
      <ui.Badge variant="destructive" size="xs" className="uppercase tracking-wide min-w-[80px]">
        Error
      </ui.Badge>
    );
  }

  return (
    <ui.Badge variant="warning" size="xs" className="uppercase tracking-wide min-w-[80px]">
      In progress
    </ui.Badge>
  );
}
