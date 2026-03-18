import { useState, useEffect } from 'react';
import { useFetcher, useNavigate } from 'react-router';
import { primitives, LoadingSpinner, usePingEvent, ui } from '@curvenote/scms-core';
import pmcGraphic from './assets/pmc-task-graphic.svg';
import type { DraftPMCDeposit } from './backend/db.server.js';
import { PMCTrackEvent } from './analytics/events.js';

type ActionData = { error?: string; drafts?: DraftPMCDeposit[] } | undefined;

export function PMCDepositTaskCard() {
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const pingEvent = usePingEvent();
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [isCheckingDrafts, setIsCheckingDrafts] = useState(false);

  const isSubmitting = fetcher.state !== 'idle' && !isCheckingDrafts;

  const handleCardClick = () => {
    if (isSubmitting || isCheckingDrafts) return;

    // Track PMC deposit task card click
    pingEvent(
      PMCTrackEvent.PMC_DEPOSIT_TASK_CARD_CLICKED,
      {},
      { anonymous: true, ignoreAdmin: true },
    );

    // Check for existing drafts first
    setIsCheckingDrafts(true);
    const formData = new FormData();
    formData.append('intent', 'get-drafts');

    fetcher.submit(formData, {
      method: 'post',
      action: '/app/works/pmc',
    });
  };

  // Handle the response from checking drafts
  useEffect(() => {
    if (isCheckingDrafts && fetcher.state === 'idle' && fetcher.data) {
      setIsCheckingDrafts(false);

      if (fetcher.data.drafts && fetcher.data.drafts.length > 0) {
        // Show resume dialog if drafts exist
        setShowResumeDialog(true);
      } else {
        // No drafts exist, create new one
        createNewDeposit();
      }
    }
  }, [fetcher.state, fetcher.data, isCheckingDrafts]);

  const createNewDeposit = () => {
    const formData = new FormData();
    // No intent means create new deposit (default behavior)

    fetcher.submit(formData, {
      method: 'post',
      action: '/app/works/pmc',
    });
  };

  const handleResume = (draft: DraftPMCDeposit) => {
    navigate(`/app/works/${draft.workId}/site/pmc/deposit/${draft.submissionVersionId}`);
  };

  return (
    <>
      <primitives.Card
        lift
        className="relative p-0 h-full bg-white transition-colors border-stone-400"
        validateUsing={fetcher}
      >
        <button
          type="button"
          onClick={handleCardClick}
          className="px-2 py-4 w-full h-full cursor-pointer hover:bg-accent/50"
          disabled={isSubmitting || isCheckingDrafts}
        >
          <div className="flex gap-2 items-center mx-2 h-full">
            <div className="flex-shrink-0">
              <img src={pmcGraphic} alt="PMC Deposit" className="w-20 h-20" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-normal">PubMed Central Submission Tool</h3>
              <p className="text-sm text-muted-foreground line-clamp-3">
                Upload your final draft and HHMI will deposit it on PubMed Central on your behalf.
              </p>
            </div>
          </div>
        </button>
        {(isSubmitting || isCheckingDrafts) && (
          <div className="flex absolute inset-0 justify-center items-center bg-white/80">
            <LoadingSpinner size={32} color="text-blue-600" thickness={4} />
          </div>
        )}
      </primitives.Card>

      <ui.ResumeDraftWorkDialog<DraftPMCDeposit>
        isOpen={showResumeDialog}
        onClose={() => setShowResumeDialog(false)}
        onCreateNew={createNewDeposit}
        onResume={handleResume}
        fetchAction="/app/works/pmc"
        fetchIntent="get-drafts"
        deleteAction="/app/works/pmc"
        deleteIntent="delete-draft"
        title="Resume Previous Deposit"
        createButtonLabel="Create New Deposit"
        objectLabel="deposit"
        resumeButtonLabel="Resume depositing"
        renderItemDetails={(draft) => (
          <>
            <div>
              {draft.completionStatus.completed} out of {draft.completionStatus.total} tasks
              completed
            </div>
            {draft.versionNumber > 1 && (
              <span className="block mt-1 text-xs text-muted-foreground">
                This is version {draft.versionNumber} of this deposit.
              </span>
            )}
          </>
        )}
      />
    </>
  );
}
