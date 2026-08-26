'use client';

import { useEffect, useRef } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { ui, useCheckMaintenanceBlocked } from '@curvenote/scms-core';
import { TextIntegrityEulaDialog } from './TextIntegrityEulaDialog.js';
import { useTextIntegrityEulaEnable } from './useTextIntegrityEulaEnable.js';

type TextIntegrityCheckRunRetryButtonProps = {
  actionPath?: string;
  workVersionId: string;
  checkRunId?: string;
};

export function TextIntegrityCheckRunRetryButton({
  actionPath,
  workVersionId,
  checkRunId,
}: TextIntegrityCheckRunRetryButtonProps) {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const lastHandledFetcherDataRef = useRef<unknown>(undefined);
  const { blocked, message } = useCheckMaintenanceBlocked('checks-text-integrity');
  const { dialogOpen, setDialogOpen, eulaPresentation, requestEnable, acceptEula, busy } =
    useTextIntegrityEulaEnable(workVersionId);
  const canRetry = Boolean(actionPath && checkRunId?.trim());
  const submitting = fetcher.state !== 'idle';
  const pending = busy || submitting;

  const runRetry = () => {
    if (!actionPath || !checkRunId?.trim()) return;
    const formData = new FormData();
    formData.append('intent', 'retry');
    formData.append('workVersionId', workVersionId);
    formData.append('checkRunId', checkRunId);
    formData.append('trigger', 'retry');
    fetcher.submit(formData, { method: 'post', action: actionPath });
  };

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (lastHandledFetcherDataRef.current === fetcher.data) return;
    lastHandledFetcherDataRef.current = fetcher.data;
    const data = fetcher.data as { error?: { message?: string }; success?: boolean };
    if (data.error?.message) ui.toastError(data.error.message);
    else if (data.success) {
      ui.toastSuccess('Text integrity check retry started');
      revalidator.revalidate();
    }
    // Omit `revalidator` from deps: identity changes during revalidation would re-fire this effect.
  }, [fetcher.state, fetcher.data]);

  if (!canRetry) return null;

  return (
    <>
      <div className="flex justify-end">
        <ui.MaintenanceTooltip enabled={blocked} message={message}>
          <ui.StatefulButton
            type="button"
            variant="outline"
            disabled={blocked || pending}
            onClick={() => requestEnable(runRetry)}
          >
            Retry check
          </ui.StatefulButton>
        </ui.MaintenanceTooltip>
      </div>
      {eulaPresentation ? (
        <TextIntegrityEulaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          html={eulaPresentation.html}
          url={eulaPresentation.url}
          version={eulaPresentation.version}
          busy={busy}
          onAccept={acceptEula}
        />
      ) : null}
    </>
  );
}
