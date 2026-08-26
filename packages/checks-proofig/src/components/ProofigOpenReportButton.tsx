'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useFetcher } from 'react-router';
import { ui, useCheckMaintenanceBlocked } from '@curvenote/scms-core';
import { ImageIntegrityTrackEvent } from '../analytics.catalog.js';
import { useChecksPingEvent } from '@hhmi/checks-shared/analytics/client';

export type ProofigOpenReportFetcherData = {
  success?: boolean;
  proofigReportOpenUrl?: string;
  error?: { type?: string; message?: string };
};

/**
 * Resolves a current Proofig access token on the server, rewrites the `token` query param for
 * this open only, then opens the report in a new tab. Stored `report_url` is unchanged (still
 * updated by notify / remote status). Requires actionPath, workVersionId, and checkRunId.
 */
export function ProofigOpenReportButton({
  reportUrl,
  actionPath,
  workVersionId,
  checkRunId,
  disabled,
  children,
  variant = 'default',
  onOpenedProofig,
}: {
  reportUrl: string;
  actionPath?: string;
  workVersionId?: string;
  checkRunId?: string;
  disabled?: boolean;
  children: ReactNode;
  variant?: React.ComponentProps<typeof ui.Button>['variant'];
  /** Runs after a successful open (e.g. sub-image flow shows the refresh dialog). */
  onOpenedProofig?: () => void;
}) {
  const { blocked, message } = useCheckMaintenanceBlocked('proofig');
  const pingEvent = useChecksPingEvent({
    checkKind: 'proofig',
    workVersionId: workVersionId ?? '',
  });
  const canServerOpen = Boolean(actionPath?.trim() && workVersionId?.trim() && checkRunId?.trim());
  const fetcher = useFetcher<ProofigOpenReportFetcherData>();
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
    if (d.success === true && d.proofigReportOpenUrl) {
      void pingEvent(ImageIntegrityTrackEvent.CHECKS_REPORT_OPENED, { checkRunId });
      window.open(d.proofigReportOpenUrl, '_blank', 'noopener,noreferrer');
      onOpenedProofig?.();
    }
  }, [fetcher.state, fetcher.data, onOpenedProofig, checkRunId, pingEvent]);

  const busy = fetcher.state !== 'idle';
  const isDisabled = disabled || blocked || !canServerOpen || !reportUrl.trim() || busy;

  return (
    <ui.MaintenanceTooltip enabled={blocked} message={message}>
      <ui.Button
        type="button"
        variant={variant}
        disabled={isDisabled}
        onClick={() => {
          if (!canServerOpen || blocked) return;
          const fd = new FormData();
          fd.set('intent', 'refresh-report-url');
          fd.set('workVersionId', workVersionId!.trim());
          fd.set('checkRunId', checkRunId!.trim());
          fetcher.submit(fd, { method: 'post', action: actionPath!.trim() });
        }}
      >
        {children}
      </ui.Button>
    </ui.MaintenanceTooltip>
  );
}
