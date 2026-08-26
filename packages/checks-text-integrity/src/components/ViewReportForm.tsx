'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import { ui, ServiceLogo, useCheckMaintenanceBlocked } from '@curvenote/scms-core';
import { TextIntegrityTrackEvent } from '../analytics.catalog.js';
import { useChecksPingEvent } from '@hhmi/checks-shared/analytics/client';
import { TextIntegrityEulaDialog } from './TextIntegrityEulaDialog.js';
import { useTextIntegrityEulaEnable } from './useTextIntegrityEulaEnable.js';

type ViewReportFetcherData = {
  success?: boolean;
  viewerUrl?: string;
  error?: { message: string };
};

interface ViewReportFormProps {
  actionPath?: string;
  workVersionId?: string;
  checkRunId?: string;
  manifestLogoUrl?: string;
  manifestTitle?: string;
}

export function ViewReportForm({
  actionPath,
  workVersionId,
  checkRunId,
  manifestLogoUrl,
  manifestTitle,
}: ViewReportFormProps) {
  const fetcher = useFetcher<ViewReportFetcherData>();
  const formRef = useRef<HTMLFormElement>(null);
  const lastHandledFetcherDataRef = useRef<unknown>(undefined);
  const pingEvent = useChecksPingEvent({
    checkKind: 'checks-text-integrity',
    workVersionId: workVersionId ?? '',
  });
  const {
    dialogOpen,
    setDialogOpen,
    eulaPresentation,
    requestEnable,
    acceptEula,
    busy: eulaBusy,
  } = useTextIntegrityEulaEnable(workVersionId ?? '');
  const { blocked, message } = useCheckMaintenanceBlocked('checks-text-integrity');

  const submitViewerUrlRequest = useCallback(() => {
    if (!formRef.current) return;
    fetcher.submit(formRef.current);
  }, [fetcher]);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (lastHandledFetcherDataRef.current === fetcher.data) return;
    lastHandledFetcherDataRef.current = fetcher.data;
    const d = fetcher.data;
    if (d.error?.message) {
      ui.toastError(d.error.message);
      return;
    }
    if (d.success === true && d.viewerUrl) {
      void pingEvent(TextIntegrityTrackEvent.CHECKS_REPORT_OPENED, { checkRunId });
      window.open(d.viewerUrl, '_blank', 'noopener,noreferrer');
    }
  }, [fetcher.state, fetcher.data, checkRunId, pingEvent]);

  const busy = fetcher.state !== 'idle' || eulaBusy;
  const canOpen =
    Boolean(actionPath?.trim() && workVersionId?.trim() && checkRunId?.trim()) && !blocked;

  return (
    <>
      <fetcher.Form ref={formRef} method="post" action={actionPath}>
        <input type="hidden" name="intent" value="refresh-viewer-url" />
        <input type="hidden" name="workVersionId" value={workVersionId ?? ''} />
        <input type="hidden" name="checkRunId" value={checkRunId ?? ''} />
        <ui.MaintenanceTooltip enabled={blocked} message={message}>
          <ui.Button
            type="button"
            variant="default"
            disabled={!canOpen || busy}
            onClick={() => {
              requestEnable(submitViewerUrlRequest);
            }}
          >
            <span className="flex gap-2 items-center">
              {busy ? <span>Opening report…</span> : <span>View report at</span>}
              <ServiceLogo
                logoUrl={manifestLogoUrl}
                alt={manifestTitle}
                fallback={manifestTitle}
                className="h-3 invert brightness-10"
              />
            </span>
          </ui.Button>
        </ui.MaintenanceTooltip>
      </fetcher.Form>
      {eulaPresentation ? (
        <TextIntegrityEulaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          logoUrl={manifestLogoUrl}
          html={eulaPresentation.html}
          url={eulaPresentation.url}
          version={eulaPresentation.version}
          busy={eulaBusy}
          onAccept={acceptEula}
        />
      ) : null}
    </>
  );
}
