import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { ui, useCheckMaintenanceBlocked } from '@curvenote/scms-core';
import { TextIntegrityEulaDialog } from './TextIntegrityEulaDialog.js';
import { useTextIntegrityEulaEnable } from './useTextIntegrityEulaEnable.js';
import { ActionOverflow, type ActionOverflowMenuItem } from '@hhmi/checks-shared/ActionOverflow';

export interface TextIntegrityPdfReportStatusProps {
  reportGenerationComplete: boolean;
  reportGenerationFailed: boolean;
  waitingForReport: boolean;
  similarityReportPdfInvalidated: boolean;
  reportPdfAvailable: boolean;
  checkRunId?: string;
  workVersionId?: string;
  actionPath?: string;
  /** When true, integrate remote-status Refresh into the primary/kebab layout. */
  includeRemoteRefresh?: boolean;
}

type ActionFetcherData = {
  success?: boolean;
  error?: { type?: string; message?: string };
  recovery?: { ok: false; message: string; status: number };
};

const RELAY_STATUS_INTENT = 'checks-text-integrity:relay-status';
const RESTART_PDF_INTENT = 'restart-similarity-pdf';

const PDF_DOWNLOAD_DEBUG_LABEL = '[checks-text-integrity:pdf-download]';

function logPdfDownloadDebug(message: string, details?: Record<string, unknown>) {
  console.info(PDF_DOWNLOAD_DEBUG_LABEL, message, details ?? {});
}

function logPdfDownloadError(message: string, details?: Record<string, unknown>) {
  console.error(PDF_DOWNLOAD_DEBUG_LABEL, message, details ?? {});
}

/**
 * Results toolbar for similarity report PDF + optional remote Refresh.
 *
 * Shows one primary control (status, download, or regenerate). Additional actions
 * move into a kebab menu on the right when more than one control is needed.
 */
export function TextIntegrityPdfReportStatus({
  reportGenerationComplete,
  reportGenerationFailed,
  waitingForReport,
  similarityReportPdfInvalidated,
  reportPdfAvailable,
  checkRunId,
  workVersionId,
  actionPath,
  includeRemoteRefresh = false,
}: TextIntegrityPdfReportStatusProps) {
  const revalidator = useRevalidator();
  const restartFetcher = useFetcher<ActionFetcherData>({ key: 'text-integrity-restart-pdf' });
  const refreshFetcher = useFetcher<ActionFetcherData>({ key: 'text-integrity-refresh-status' });
  const lastRestartRef = useRef<unknown>(undefined);
  const lastRefreshRef = useRef<unknown>(undefined);
  const retryReachedWaitingRef = useRef(false);
  const [retried, setRetried] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const {
    dialogOpen,
    setDialogOpen,
    eulaPresentation,
    requestEnable,
    acceptEula,
    busy: eulaBusy,
  } = useTextIntegrityEulaEnable(workVersionId ?? '');
  const { blocked, message: maintenanceMessage } =
    useCheckMaintenanceBlocked('checks-text-integrity');

  useEffect(() => {
    if (restartFetcher.state !== 'idle' || !restartFetcher.data) return;
    if (lastRestartRef.current === restartFetcher.data) return;
    lastRestartRef.current = restartFetcher.data;
    const d = restartFetcher.data;
    if (d.error?.message) {
      ui.toastError(d.error.message);
      return;
    }
    if (d.success) {
      setRetried(true);
      revalidator.revalidate();
    }
  }, [restartFetcher.state, restartFetcher.data, revalidator]);

  useEffect(() => {
    if (refreshFetcher.state !== 'idle' || !refreshFetcher.data) return;
    if (lastRefreshRef.current === refreshFetcher.data) return;
    lastRefreshRef.current = refreshFetcher.data;
    const d = refreshFetcher.data;
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
  }, [refreshFetcher.state, refreshFetcher.data, revalidator]);

  useEffect(() => {
    setRetried(false);
    retryReachedWaitingRef.current = false;
  }, [checkRunId]);

  useEffect(() => {
    if (!retried) {
      retryReachedWaitingRef.current = false;
      return;
    }
    if (waitingForReport) {
      retryReachedWaitingRef.current = true;
      return;
    }
    if (retryReachedWaitingRef.current && (reportGenerationFailed || reportPdfAvailable)) {
      setRetried(false);
      retryReachedWaitingRef.current = false;
    }
  }, [retried, waitingForReport, reportGenerationFailed, reportPdfAvailable]);

  const downloadUrl = checkRunId
    ? `/app/checks-text-integrity/download-pdf/${encodeURIComponent(checkRunId)}`
    : undefined;
  const canDownload = reportPdfAvailable && Boolean(downloadUrl);
  const canRestart =
    Boolean(actionPath?.trim()) && Boolean(checkRunId?.trim()) && Boolean(workVersionId?.trim());
  const canRegenerate =
    similarityReportPdfInvalidated &&
    !waitingForReport &&
    !reportGenerationFailed &&
    canRestart &&
    !blocked;
  const showGeneratedText =
    reportGenerationComplete &&
    !canDownload &&
    !waitingForReport &&
    !similarityReportPdfInvalidated;
  const showWaiting = waitingForReport || retried;
  const restartBusy = restartFetcher.state !== 'idle';
  const refreshBusy = refreshFetcher.state !== 'idle';
  const canRefresh = Boolean(
    includeRemoteRefresh && actionPath?.trim() && workVersionId?.trim() && checkRunId?.trim(),
  );

  const runDownload = useCallback(async () => {
    if (!downloadUrl) return;
    setDownloading(true);
    logPdfDownloadDebug('starting download request', {
      checkRunId,
      workVersionId,
      downloadUrl,
      currentUrl: window.location.href,
      online: navigator.onLine,
    });
    try {
      const res = await fetch(downloadUrl, { credentials: 'same-origin' });
      const responseDetails = {
        checkRunId,
        workVersionId,
        downloadUrl,
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get('content-type'),
        contentDisposition: res.headers.get('content-disposition'),
      };
      logPdfDownloadDebug('received download response', responseDetails);
      if (!res.ok) {
        const text = await res.text().catch((error: unknown) => {
          logPdfDownloadError('failed to read error response body', {
            ...responseDetails,
            error,
          });
          return '';
        });
        let body: { message?: string } | null = null;
        try {
          body = text ? (JSON.parse(text) as { message?: string }) : null;
        } catch (error) {
          logPdfDownloadError('failed to parse error response JSON', {
            ...responseDetails,
            error,
            bodyText: text,
          });
        }
        logPdfDownloadError('download response was not ok', {
          ...responseDetails,
          body,
          bodyText: text,
        });
        ui.toastError(body?.message ?? `Download failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition');
      let filename = 'similarity-report.pdf';
      if (cd) {
        const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
        if (m?.[1]) filename = m[1].trim();
      }
      logPdfDownloadDebug('download blob ready', {
        checkRunId,
        workVersionId,
        downloadUrl,
        blobSize: blob.size,
        blobType: blob.type,
        filename,
      });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      logPdfDownloadError('download request threw', {
        checkRunId,
        workVersionId,
        downloadUrl,
        error: e,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        online: navigator.onLine,
      });
      ui.toastError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, [checkRunId, downloadUrl, workVersionId]);

  const handleDownload = useCallback(() => {
    logPdfDownloadDebug('download button clicked; requesting EULA gate', {
      checkRunId,
      workVersionId,
      downloadUrl,
    });
    requestEnable(() => {
      logPdfDownloadDebug('EULA gate passed; running download callback', {
        checkRunId,
        workVersionId,
        downloadUrl,
      });
      void runDownload();
    });
  }, [checkRunId, downloadUrl, requestEnable, runDownload, workVersionId]);

  const submitRestart = () => {
    if (!canRestart || blocked || restartBusy || showWaiting) return;
    const fd = new FormData();
    fd.set('intent', RESTART_PDF_INTENT);
    fd.set('workVersionId', workVersionId!.trim());
    fd.set('checkRunId', checkRunId!.trim());
    restartFetcher.submit(fd, { method: 'post', action: actionPath!.trim() });
  };

  const submitRefresh = () => {
    if (!canRefresh || blocked || refreshBusy) return;
    if (!checkRunId?.trim()) {
      ui.toastError('Check run is not ready yet.');
      return;
    }
    const fd = new FormData();
    fd.set('intent', RELAY_STATUS_INTENT);
    fd.set('workVersionId', workVersionId!.trim());
    fd.set('checkRunId', checkRunId.trim());
    refreshFetcher.submit(fd, { method: 'post', action: actionPath!.trim() });
  };

  // Keep failure chrome visible during maintenance (Retry/Refresh stay disabled via blocked).
  const showPdfChrome =
    canDownload ||
    showGeneratedText ||
    showWaiting ||
    (canRegenerate && !retried) ||
    (reportGenerationFailed && canRestart && !retried);

  if (!showPdfChrome && !canRefresh) return null;

  // Refresh alone — no kebab (matches progress-area Refresh when PDF chrome is absent).
  if (!showPdfChrome) {
    return (
      <ui.MaintenanceTooltip enabled={blocked} message={maintenanceMessage}>
        <ui.StatefulButton
          variant="link"
          busy={refreshBusy}
          disabled={blocked}
          onClick={submitRefresh}
          overlayBusy
        >
          Refresh
        </ui.StatefulButton>
      </ui.MaintenanceTooltip>
    );
  }

  // Regenerate is the primary CTA when the stored PDF was invalidated (no download yet).
  const showRegeneratePrimary = canRegenerate && !retried && !showWaiting && !canDownload;
  // Manual regenerate is allowed anytime except while a generate is already in progress.
  const regenerateInProgress = showWaiting || restartBusy;
  // Keep a Regenerate/Retry item in the kebab whenever restart is wired, except when it is
  // already the primary control (Proofig-aligned).
  const showRegenerateInMenu = canRestart && !showRegeneratePrimary;

  const menuItems: ActionOverflowMenuItem[] = [];
  if (canRefresh) {
    menuItems.push({
      id: 'refresh',
      label: refreshBusy ? 'Refreshing…' : 'Refresh',
      onSelect: submitRefresh,
      disabled: blocked || refreshBusy,
    });
  }
  if (showRegenerateInMenu) {
    const regenerateLabel = reportGenerationFailed
      ? restartBusy
        ? 'Retrying…'
        : 'Retry PDF generation'
      : restartBusy
        ? 'Regenerating…'
        : 'Regenerate PDF';
    menuItems.push({
      id: 'regenerate-pdf',
      label: regenerateLabel,
      onSelect: submitRestart,
      disabled: blocked || regenerateInProgress,
    });
  }

  let primary: ReactNode;
  if (showWaiting) {
    primary = (
      <span className="text-sm font-normal whitespace-nowrap opacity-50 animate-pulse text-primary">
        Waiting for PDF Report…
      </span>
    );
  } else if (showRegeneratePrimary) {
    primary = (
      <ui.Button
        type="button"
        variant="link"
        disabled={blocked || restartBusy}
        onClick={submitRestart}
      >
        {restartBusy ? 'Regenerating…' : 'Regenerate PDF'}
      </ui.Button>
    );
  } else if (canDownload) {
    primary = (
      <ui.Button
        type="button"
        variant="link"
        disabled={downloading || eulaBusy}
        onClick={handleDownload}
      >
        {downloading ? 'Downloading…' : 'Download PDF report'}
      </ui.Button>
    );
  } else if (reportGenerationFailed) {
    primary = (
      <span className="text-sm font-normal whitespace-nowrap text-destructive">
        PDF Generation Failed
      </span>
    );
  } else if (showGeneratedText) {
    primary = (
      <span className="text-sm font-normal text-muted-foreground">
        Similarity PDF report generated
      </span>
    );
  } else {
    primary = null;
  }

  return (
    <>
      <ui.MaintenanceTooltip enabled={blocked} message={maintenanceMessage}>
        <ActionOverflow primary={primary} menuItems={menuItems} />
      </ui.MaintenanceTooltip>
      {eulaPresentation ? (
        <TextIntegrityEulaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
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
