import { Check } from 'lucide-react';
import type { NormalizedScientist } from '../backend/types.js';
import { cn, plural, ui } from '@curvenote/scms-core';
import { useSearchParams } from 'react-router';

export function ComplianceStatus({ scientist }: { scientist: NormalizedScientist }) {
  const [, setSearchParams] = useSearchParams();
  const { preprints, publications } = scientist;

  const totalPublications = (preprints?.total ?? 0) + (publications?.total ?? 0);
  const allCompliant = preprints?.nonCompliant === 0 && publications?.nonCompliant === 0;
  const bothHaveIssues =
    (preprints?.nonCompliant ?? 0) > 0 && (publications?.nonCompliant ?? 0) > 0;

  const handleComplianceIssueClick = () => {
    // Set URL parameter to filter for non-compliant items
    setSearchParams({ filters: ui.encodeFiltersForURL({ 'compliance-state': 'non-compliant' }) });
  };

  // Check if there are no publications at all
  if (totalPublications === 0) {
    return (
      <div className={cn('flex flex-col self-stretch w-auto', 'md:min-w-xs')}>
        <div className="flex flex-1 justify-center items-center p-6 rounded-lg bg-muted/30 dark:bg-muted/10">
          <div className="text-xl font-medium text-muted-foreground">No Published Work</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('flex w-auto flex-col self-stretch', {
        'md:min-w-sm': bothHaveIssues,
        'md:min-w-xs': allCompliant || !bothHaveIssues,
      })}
    >
      <div
        className={cn('flex flex-1 items-center rounded-lg bg-success/10 dark:bg-success/10', {
          'justify-center bg-success/10 dark:bg-success/10': allCompliant,
          'transition-colors cursor-pointer bg-destructive/10 dark:bg-destructive/10 hover:bg-destructive/15':
            !allCompliant,
        })}
        onClick={!allCompliant ? handleComplianceIssueClick : undefined}
        role={!allCompliant ? 'button' : undefined}
        tabIndex={!allCompliant ? 0 : undefined}
        onKeyDown={
          !allCompliant
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleComplianceIssueClick();
                }
              }
            : undefined
        }
        title={!allCompliant ? 'Click to view non-compliant publications' : undefined}
      >
        {allCompliant && (
          <div className="flex gap-3 items-center p-6">
            <div className="flex justify-center items-center w-8 h-8 rounded-full bg-success shrink-0">
              <Check className="w-5 h-5 text-white" />
            </div>
            <div className="text-2xl font-semibold">Compliant</div>
          </div>
        )}
        {!allCompliant && (
          <div className="flex items-center py-6">
            <div className="flex w-full divide-x-2 divide-red-700">
              {(preprints?.nonCompliant ?? 0) > 0 && (
                <div className="flex flex-col flex-1 gap-2 px-6">
                  <div className="text-4xl font-semibold text-red-700">
                    {preprints?.nonCompliant}
                  </div>
                  <div>{plural('Preprint compliance issue(s)', preprints?.nonCompliant ?? 0)}</div>
                </div>
              )}
              {(publications?.nonCompliant ?? 0) > 0 && (
                <div className="flex flex-col flex-1 gap-2 px-6">
                  <div className="text-4xl font-semibold text-red-700">
                    {publications?.nonCompliant}
                  </div>
                  <div>
                    {plural('Journal article compliance issue(s)', publications?.nonCompliant ?? 0)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
