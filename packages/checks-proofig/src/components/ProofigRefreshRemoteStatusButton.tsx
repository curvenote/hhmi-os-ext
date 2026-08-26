import type { ComponentProps } from 'react';
import { useEffect, useRef } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { ui, useCheckMaintenanceBlocked } from '@curvenote/scms-core';

type RefreshFetcherData = {
  success?: boolean;
  error?: { type?: string; message?: string };
};

export function ProofigRefreshRemoteStatusButton({
  actionPath,
  workVersionId,
  checkRunId,
  buttonSize,
}: {
  actionPath: string;
  workVersionId: string;
  checkRunId?: string;
  buttonSize?: ComponentProps<typeof ui.StatefulButton>['size'];
}) {
  const fetcher = useFetcher<RefreshFetcherData>();
  const revalidator = useRevalidator();
  const lastHandledFetcherDataRef = useRef<unknown>(undefined);
  const { blocked, message } = useCheckMaintenanceBlocked('proofig');

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
  }, [fetcher.state, fetcher.data]);

  const busy = fetcher.state !== 'idle';

  const refresh = () => {
    const fd = new FormData();
    fd.set('intent', 'refresh-remote-status');
    fd.set('workVersionId', workVersionId);
    if (checkRunId) fd.set('checkRunId', checkRunId);
    fetcher.submit(fd, { method: 'post', action: actionPath });
  };

  return (
    <ui.MaintenanceTooltip enabled={blocked} message={message}>
      <ui.StatefulButton
        variant="link"
        busy={busy}
        disabled={blocked}
        onClick={refresh}
        overlayBusy
        size={buttonSize}
      >
        Refresh
      </ui.StatefulButton>
    </ui.MaintenanceTooltip>
  );
}
