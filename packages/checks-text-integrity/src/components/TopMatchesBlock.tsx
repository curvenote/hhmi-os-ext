import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { StoredSimilarityReport, StoredTopMatch } from '../schema.js';
import { SimilarityPercentageBar } from './SimilarityPercentageBar.js';

interface TopMatchesBlockProps {
  report: StoredSimilarityReport;
}

function formatSourceType(sourceType: string): string {
  const t = sourceType.toUpperCase();
  if (t.includes('INTERNET')) return 'internet';
  if (t.includes('PUBLICATION')) return 'publications';
  if (t.includes('SUBMITTED')) return 'submitted work';
  return sourceType.toLowerCase();
}

function MatchRow({ match }: { match: StoredTopMatch }) {
  const sourceLabel = formatSourceType(match.sourceType);
  const detail = [`${match.matchedWordCountTotal} words`, sourceLabel].filter(Boolean).join(', ');
  const title = match.name || 'Untitled';
  const meta = [match.submittedDate, match.institutionName].filter(Boolean).join(' by ');
  const pct = match.percentage ?? 0;

  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <div className="min-w-0 space-y-1.5">
        <div className="flex gap-2 items-baseline">
          <span className="text-lg font-semibold text-foreground">{match.percentage}%</span>
          <span className="text-sm truncate text-muted-foreground">{title}</span>
        </div>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
        <div className="text-xs text-muted-foreground">{detail}</div>
        <SimilarityPercentageBar percentage={pct} />
      </div>
    </div>
  );
}

export function TopMatchesBlock({ report }: TopMatchesBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const topMatches = report.topMatches ?? [];

  return (
    <div className="p-4 rounded-lg border shadow-sm border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex gap-2 justify-between items-start w-full text-left"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-base font-semibold text-foreground">Top matches</div>
          <p className="text-sm text-muted-foreground">
            The sources with the strongest overlap with your document, listed by match percentage.
          </p>
        </div>
        <span className="mt-1 shrink-0 text-muted-foreground" aria-hidden>
          {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </span>
      </button>

      {expanded && (
        <div className="pt-4 mt-4 border-t border-border">
          {topMatches.length === 0 ? (
            <div className="py-2 text-sm text-center text-muted-foreground">
              No matching sources
            </div>
          ) : (
            <div className="py-2 space-y-0">
              {topMatches.map((match, i) => (
                <MatchRow key={`${match.name}-${i}`} match={match} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
