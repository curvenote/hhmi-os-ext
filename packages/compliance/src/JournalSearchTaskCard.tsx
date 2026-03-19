import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LoadingSpinner, primitives } from '@curvenote/scms-core';
import { HHMITrackEvent } from './analytics/events.js';
import { useCompliancePingEvent } from './utils/analytics.js';
import journalCoverageIcon from './assets/journal-coverage-icon.svg';

const JOURNAL_SEARCH_PATH = '/app/task/journal-search';

export function JournalSearchTaskCard() {
  const navigate = useNavigate();
  const pingEvent = useCompliancePingEvent();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);

    pingEvent(
      HHMITrackEvent.HHMI_COMPLIANCE_JOURNAL_SEARCH_TASK_CLICKED,
      {},
      { ignoreAdmin: true },
    );

    await new Promise((resolve) => setTimeout(resolve, 300));

    navigate(JOURNAL_SEARCH_PATH);
  };

  return (
    <primitives.Card
      lift
      className="relative p-0 h-full bg-white transition-colors cursor-pointer border-stone-400 hover:bg-accent/50"
    >
      <button
        type="button"
        onClick={handleClick}
        className="px-2 py-4 w-full h-full cursor-pointer"
        disabled={isLoading}
      >
        <div className="flex gap-2 items-center mx-2 h-full">
          <div className="flex-shrink-0">
            <img src={journalCoverageIcon} alt="Journal Coverage" className="w-20 h-20" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-lg font-normal">Journal Payment Lookup Tool</h3>
            <p className="text-sm text-muted-foreground">
              Look up a journal to see whether HHMI lab budgets can be used to pay open access or
              other fees.
            </p>
          </div>
        </div>
      </button>
      {isLoading && (
        <div className="flex absolute inset-0 justify-center items-center bg-white/80">
          <LoadingSpinner size={32} color="text-blue-600" thickness={4} />
        </div>
      )}
    </primitives.Card>
  );
}
