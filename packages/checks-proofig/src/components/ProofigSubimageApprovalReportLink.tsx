import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { ui } from '@curvenote/scms-core';
import { ProofigOpenReportButton } from './ProofigOpenReportButton.js';

type RefreshFetcherData = {
  success?: boolean;
  error?: { type?: string; message?: string };
};

/**
 * Opens the Proofig report in a new tab using a server-refreshed access token in the report URL.
 * When remote refresh is configured, also opens a short dialog; dismissing it (X, overlay, Escape,
 * or primary action) POSTs refresh-remote-status.
 */
const DEFAULT_FOLLOW_UP_TITLE = 'Proofig was opened for figure panel approval';
const DEFAULT_FOLLOW_UP_DESCRIPTION =
  'Figure sub-image approval was started at Proofig. If you approved all sub-images, press Continue below to close this dialog.';

export function ProofigSubimageApprovalReportLink({
  reportUrl,
  actionPath,
  workVersionId,
  checkRunId,
  children,
  disabled,
  followUpDialogTitle = DEFAULT_FOLLOW_UP_TITLE,
  followUpDialogDescription = DEFAULT_FOLLOW_UP_DESCRIPTION,
}: {
  reportUrl: string;
  actionPath?: string;
  workVersionId?: string;
  checkRunId?: string;
  children: ReactNode;
  disabled?: boolean;
  /** Shown after the report opens in a new tab (when remote refresh is configured). */
  followUpDialogTitle?: string;
  followUpDialogDescription?: string;
}) {
  const canFollowUpRefresh = Boolean(actionPath && workVersionId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const fetcher = useFetcher<RefreshFetcherData>();
  const revalidator = useRevalidator();
  const lastHandledFetcherDataRef = useRef<unknown>(undefined);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (lastHandledFetcherDataRef.current === fetcher.data) return;
    lastHandledFetcherDataRef.current = fetcher.data;
    const d = fetcher.data;
    if (d.error?.message) {
      ui.toastError(d.error.message);
      return;
    }
    if (d.success === true) {
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const submitRefresh = () => {
    if (!actionPath || !workVersionId) return;
    const fd = new FormData();
    fd.set('intent', 'refresh-remote-status');
    fd.set('workVersionId', workVersionId);
    if (checkRunId) fd.set('checkRunId', checkRunId);
    fetcher.submit(fd, { method: 'post', action: actionPath });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && dialogOpen && canFollowUpRefresh) {
      submitRefresh();
    }
    setDialogOpen(nextOpen);
  };

  return (
    <>
      <ProofigOpenReportButton
        reportUrl={reportUrl}
        actionPath={actionPath}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        disabled={disabled}
        onOpenedProofig={canFollowUpRefresh ? () => setDialogOpen(true) : undefined}
      >
        {children}
      </ProofigOpenReportButton>

      {canFollowUpRefresh ? (
        <ui.Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
          <ui.DialogContent className="sm:max-w-md">
            <ui.DialogHeader>
              <ui.DialogTitle>{followUpDialogTitle}</ui.DialogTitle>
              <ui.DialogDescription>{followUpDialogDescription}</ui.DialogDescription>
            </ui.DialogHeader>
            <div className="flex justify-end pt-2">
              <ui.Button type="button" onClick={() => handleOpenChange(false)}>
                Continue
              </ui.Button>
            </div>
          </ui.DialogContent>
        </ui.Dialog>
      ) : null}
    </>
  );
}
