'use client';

import { useEffect, useRef } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { ui, useCheckMaintenanceBlocked } from '@curvenote/scms-core';

type ProofigCheckRunRetryButtonProps = {
  actionPath?: string;
  workVersionId: string;
  checkRunId?: string;
};

export function ProofigCheckRunRetryButton({
  actionPath,
  workVersionId,
  checkRunId,
}: ProofigCheckRunRetryButtonProps) {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const lastHandledFetcherDataRef = useRef<unknown>(undefined);
  const { blocked, message } = useCheckMaintenanceBlocked('proofig');
  const canRetry = Boolean(actionPath && checkRunId?.trim());
  const pending = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (lastHandledFetcherDataRef.current === fetcher.data) return;
    lastHandledFetcherDataRef.current = fetcher.data;
    const data = fetcher.data as { error?: { message?: string }; success?: boolean };
    if (data.error?.message) ui.toastError(data.error.message);
    else if (data.success) {
      ui.toastSuccess('Image integrity check retry started');
      revalidator.revalidate();
    }
    // Omit `revalidator` from deps: identity changes during revalidation would re-fire this effect.
  }, [fetcher.state, fetcher.data]);

  if (!canRetry) return null;

  return (
    <div className="flex justify-end">
      <ui.MaintenanceTooltip enabled={blocked} message={message}>
        <fetcher.Form method="post" action={actionPath}>
          <input type="hidden" name="intent" value="retry" />
          <input type="hidden" name="workVersionId" value={workVersionId} />
          <input type="hidden" name="checkRunId" value={checkRunId} />
          <input type="hidden" name="trigger" value="retry" />
          <ui.StatefulButton type="submit" variant="outline" disabled={blocked || pending}>
            Retry check
          </ui.StatefulButton>
        </fetcher.Form>
      </ui.MaintenanceTooltip>
    </div>
  );
}
