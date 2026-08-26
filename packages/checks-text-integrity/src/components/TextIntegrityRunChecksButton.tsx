'use client';

import { useFetcher } from 'react-router';
import { ui, useCheckMaintenanceBlocked, useRevalidateOnInterval } from '@curvenote/scms-core';
import { useHoldingBusy } from '@hhmi/checks-shared/useHoldingBusy';
import { TextIntegrityEulaDialog } from './TextIntegrityEulaDialog.js';
import { useTextIntegrityEulaEnable } from './useTextIntegrityEulaEnable.js';

type TextIntegrityRunChecksButtonProps = {
  actionPath?: string;
  workVersionId: string;
};

export function TextIntegrityRunChecksButton({
  actionPath,
  workVersionId,
}: TextIntegrityRunChecksButtonProps) {
  const executeFetcher = useFetcher();
  const { blocked, message } = useCheckMaintenanceBlocked('checks-text-integrity');
  const { dialogOpen, setDialogOpen, eulaPresentation, requestEnable, acceptEula, busy } =
    useTextIntegrityEulaEnable(workVersionId);
  const holdingBusy = useHoldingBusy({
    fetcher: executeFetcher,
    onSettledError: (message) => ui.toastError(message),
  });
  const isBusy = busy || executeFetcher.state !== 'idle' || holdingBusy;

  const canSubmit = Boolean(actionPath?.trim());
  const runExecute = () => {
    if (!canSubmit) return;
    const formData = new FormData();
    formData.append('intent', 'execute');
    formData.append('workVersionId', workVersionId);
    formData.append('trigger', 'checks_page');
    executeFetcher.submit(formData, { method: 'post', action: actionPath });
  };

  // Keep revalidating while holding busy so the parent can swap CTA → progress.
  useRevalidateOnInterval({
    enabled: holdingBusy && executeFetcher.state === 'idle',
    interval: 1000,
  });

  return (
    <>
      <ui.MaintenanceTooltip enabled={blocked} message={message}>
        <ui.StatefulButton
          type="button"
          variant="default"
          busy={isBusy}
          disabled={blocked || !canSubmit}
          onClick={() => requestEnable(runExecute)}
        >
          Run checks now
        </ui.StatefulButton>
      </ui.MaintenanceTooltip>
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
