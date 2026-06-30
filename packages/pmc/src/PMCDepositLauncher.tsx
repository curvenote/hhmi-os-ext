import { useEffect, useRef, useState } from 'react';
import { useFetcher, useNavigate, useNavigation } from 'react-router';
import { LoadingSpinner, MainWrapper, PageFrame, ui, usePingEvent } from '@curvenote/scms-core';
import type { DraftPMCDeposit } from './backend/db.server.js';
import { PMCTrackEvent } from './analytics/events.js';
import {
  getPmcLauncherErrorMessage,
  pmcDepositPath,
  shouldAutoCreateDeposit,
  shouldNavigateToCreatedDeposit,
  shouldOpenDraftDialog,
  type PmcLauncherActionData,
} from './pmcDepositLauncherState.js';

const INITIAL_PAUSE_MS = 500;

export function PMCDepositLauncher() {
  const fetcher = useFetcher<PmcLauncherActionData>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const pingEvent = usePingEvent();
  const [isReady, setIsReady] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const hasSubmittedCreate = useRef(false);
  const hasCheckedDrafts = useRef(false);

  const isIdle = navigation.state === 'idle';
  const isCheckingDrafts = fetcher.state !== 'idle' && !hasSubmittedCreate.current;
  const actionError = fetcher.state === 'idle' ? getPmcLauncherErrorMessage(fetcher.data) : null;

  const submitGetDrafts = () => {
    const formData = new FormData();
    formData.append('intent', 'get-drafts');
    fetcher.submit(formData, { method: 'post', action: '/app/works/pmc' });
  };

  const retry = () => {
    hasCheckedDrafts.current = false;
    hasSubmittedCreate.current = false;
    setDialogOpen(false);
    submitGetDrafts();
  };

  useEffect(() => {
    const t = setTimeout(() => setIsReady(true), INITIAL_PAUSE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isReady || !isIdle || hasCheckedDrafts.current) return;
    hasCheckedDrafts.current = true;
    pingEvent(
      PMCTrackEvent.PMC_DEPOSIT_TASK_CARD_CLICKED,
      {},
      { anonymous: true, ignoreAdmin: true },
    );
    submitGetDrafts();
  }, [isReady, isIdle, pingEvent]);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;

    const createdDeposit = shouldNavigateToCreatedDeposit(fetcher.data);
    if (createdDeposit) {
      navigate(pmcDepositPath(createdDeposit.workId, createdDeposit.submissionVersionId), {
        replace: true,
      });
      return;
    }

    if (shouldOpenDraftDialog(fetcher.data)) {
      setDialogOpen(true);
      return;
    }

    if (shouldAutoCreateDeposit(fetcher.data, hasSubmittedCreate.current)) {
      hasSubmittedCreate.current = true;
      fetcher.submit(new FormData(), { method: 'post', action: '/app/works/pmc' });
    }
  }, [fetcher.state, fetcher.data, fetcher, navigate]);

  const createNewDeposit = () => {
    hasSubmittedCreate.current = true;
    fetcher.submit(new FormData(), { method: 'post', action: '/app/works/pmc' });
  };

  const handleResume = (draft: DraftPMCDeposit) => {
    navigate(pmcDepositPath(draft.workId, draft.submissionVersionId), { replace: true });
  };

  const loadingMessage = (
    <div className="flex flex-col gap-6 justify-center items-center text-center">
      <LoadingSpinner size={40} color="text-blue-600" thickness={4} />
      <p className="text-lg font-medium text-muted-foreground">Preparing</p>
      <p className="text-sm text-muted-foreground font-mono">
        You should be taken to the PMC deposit form in a moment.
      </p>
    </div>
  );

  if (actionError) {
    return (
      <MainWrapper>
        <PageFrame className="flex flex-col gap-6 justify-center items-center mx-auto max-w-lg h-screen text-center">
          <ui.SimpleAlert type="error" message={actionError} />
          <div className="flex flex-wrap gap-3 justify-center">
            <ui.Button onClick={retry}>Try again</ui.Button>
            <ui.Button variant="outline" onClick={() => navigate('/app/works')}>
              Back to My Works
            </ui.Button>
          </div>
        </PageFrame>
      </MainWrapper>
    );
  }

  if (!isReady || !isIdle || isCheckingDrafts) {
    return (
      <MainWrapper>
        <PageFrame className="flex flex-col justify-center items-center mx-auto max-w-3xl h-screen">
          {loadingMessage}
        </PageFrame>
      </MainWrapper>
    );
  }

  return (
    <MainWrapper>
      <PageFrame className="mx-auto max-w-3xl"> </PageFrame>
      <ui.ResumeDraftWorkDialog<DraftPMCDeposit>
        isOpen={dialogOpen}
        onClose={() => navigate('/app/works')}
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
    </MainWrapper>
  );
}
