import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { StoredSimilarityReport } from '../schema.js';
import { SimilarityPercentageBar } from './SimilarityPercentageBar.js';

interface SimilarityScoresBlockProps {
  report: StoredSimilarityReport;
}

export function SimilarityScoresBlock({ report }: SimilarityScoresBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const overall = report.overallMatchPercentage ?? 0;
  const internet = report.internetMatchPercentage;
  const publication = report.publicationMatchPercentage;
  const submitted = report.submittedWorksMatchPercentage;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Similarity scores</h3>
      <p className="text-sm text-muted-foreground">
        This is the amount of text matching other sources. The bar length shows the match
        percentage; its color reflects the same scale used for report indicators. A low score does
        not rule out issues, and a high score can still be explainable.
      </p>

      <div className="p-4 rounded-lg border shadow-sm border-border bg-card">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex gap-2 justify-between items-start w-full text-left"
          aria-expanded={expanded}
        >
          <div className="flex-1 space-y-1 min-w-0">
            <div className="text-2xl font-bold text-foreground">{overall}%</div>
            <div className="text-sm text-muted-foreground">Text similar to other sources</div>
            <SimilarityPercentageBar percentage={overall} className="max-w-full" />
          </div>
          <span className="mt-1 shrink-0 text-muted-foreground" aria-hidden>
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </span>
        </button>

        {expanded && (
          <div className="pt-4 mt-4 space-y-3 border-t border-border">
            {internet != null && (
              <div className="space-y-0.5">
                <div className="text-lg font-medium text-foreground">{internet}%</div>
                <div className="text-sm text-muted-foreground">Internet sources</div>
                <SimilarityPercentageBar percentage={internet} />
              </div>
            )}
            {publication != null && (
              <div className="space-y-0.5">
                <div className="text-lg font-medium text-foreground">{publication}%</div>
                <div className="text-sm text-muted-foreground">Publications</div>
                <SimilarityPercentageBar percentage={publication} />
              </div>
            )}
            {submitted != null && (
              <div className="space-y-0.5">
                <div className="text-lg font-medium text-foreground">{submitted}%</div>
                <div className="text-sm text-muted-foreground">Submitted works</div>
                <SimilarityPercentageBar percentage={submitted} />
              </div>
            )}
            {internet == null && publication == null && submitted == null && (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
