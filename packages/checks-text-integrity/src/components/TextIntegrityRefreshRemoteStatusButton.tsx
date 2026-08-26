import type { ComponentProps } from 'react';
import { useEffect, useRef } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { ui, useCheckMaintenanceBlocked } from '@curvenote/scms-core';

type RefreshFetcherData = {
  success?: boolean;
  error?: { type?: string; message?: string };
  recovery?: { ok: false; message: string; status: number };
};

const INTENT = 'checks-text-integrity:relay-status';

export function TextIntegrityRefreshRemoteStatusButton({
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
  const { blocked, message } = useCheckMaintenanceBlocked('checks-text-integrity');

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
      if (d.recovery?.ok === false) {
        ui.toastWarning('Status refreshed, but recovery did not start', {
          description: d.recovery.message,
        });
      }
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const busy = fetcher.state !== 'idle';

  const refresh = () => {
    if (!checkRunId?.trim()) {
      ui.toastError('Check run is not ready yet.');
      return;
    }
    const fd = new FormData();
    fd.set('intent', INTENT);
    fd.set('workVersionId', workVersionId);
    fd.set('checkRunId', checkRunId.trim());
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
        Refresh status
      </ui.StatefulButton>
    </ui.MaintenanceTooltip>
  );
}
