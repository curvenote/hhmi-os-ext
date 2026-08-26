import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useFetcher, useFetchers, useRevalidator } from 'react-router';
import { ui, useCheckMaintenanceBlocked } from '@curvenote/scms-core';
import type { ProofigDataSchema } from '../schema.js';
import {
  PROOFIG_REPORT_FILENAME,
  PROOFIG_PDF_GENERATING_STALE_MS,
  getProofigPdfAttemptState,
  getProofigPdfReadiness,
  parseProofigPdfRequestStamp,
} from '../proofigReportFiles.js';
import { ActionOverflow, type ActionOverflowMenuItem } from '@hhmi/checks-shared/ActionOverflow';
import { ProofigRefreshRemoteStatusButton } from './ProofigRefreshRemoteStatusButton.js';

type ActionFetcherData = {
  success?: boolean;
  error?: { type?: string; message?: string };
};

function downloadHref(checkRunId: string): string {
  return `/app/checks-proofig/download-pdf/${encodeURIComponent(checkRunId)}`;
}

const PROOFIG_PDF_REGENERATE_KEY_PREFIX = 'proofig-pdf-regenerate:';

/** True when another instance's regenerate fetcher is in flight for the same check run. */
function isPeerRegenerateSubmitting(
  fetchers: ReturnType<typeof useFetchers>,
  checkRunId: string | undefined,
  localFetcherKey: string,
): boolean {
  const runId = checkRunId?.trim();
  if (!runId) return false;
  return fetchers.some((f) => {
    if (f.key === localFetcherKey || f.state === 'idle') return false;
    if (!f.key.startsWith(PROOFIG_PDF_REGENERATE_KEY_PREFIX)) return false;
    const intent = f.formData?.get('intent');
    if (intent != null && intent !== 'regenerate-pdf') return false;
    return f.formData?.get('checkRunId') === runId;
  });
}

/**
 * Results / dialog toolbar for Proofig report PDF + optional remote Refresh.
 *
 * Shows one primary control (status, download, or Refresh alone). Additional actions
 * move into a kebab menu on the right when more than one control is needed.
 */
export function ProofigReportPdfActions({
  proofigData,
  workVersionId,
  checkRunId,
  actionPath,
  /** When true, integrate remote-status Refresh into the primary/kebab layout. */
  includeRemoteRefresh = false,
}: {
  proofigData: ProofigDataSchema | undefined;
  workVersionId?: string;
  checkRunId?: string;
  actionPath?: string;
  includeRemoteRefresh?: boolean;
}) {
  const { blocked, message: maintenanceMessage } = useCheckMaintenanceBlocked('proofig');
  // Fetcher keys are router-global; prefix per-instance ids so concurrent mounts of the same
  // checkRunId (design gallery, concurrent view mounts) stay isolated for toast/settle while
  // still allowing run-scoped useFetchers busy scanning against shared regenerate submissions.
  const instanceId = useId();
  const regenerateFetcherKey = `proofig-pdf-regenerate:${instanceId}`;
  const regenerateFetcher = useFetcher<ActionFetcherData>({
    key: regenerateFetcherKey,
  });
  const refreshFetcher = useFetcher<ActionFetcherData>({
    key: `proofig-pdf-refresh:${instanceId}`,
  });
  const fetchers = useFetchers();
  const revalidator = useRevalidator();
  const lastRegenRef = useRef<unknown>(undefined);
  const lastRefreshRef = useRef<unknown>(undefined);
  const [downloading, setDownloading] = useState(false);
  // Stale stamped jobs conservatively render Generating during SSR and correct in this client
  // effect; stale jobs are rarer, and this keeps the server and initial client markup identical.
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const requestedAtMs = parseProofigPdfRequestStamp(proofigData?.proofigReportPdfRequestedAt);
    if (requestedAtMs == null) return;

    const now = Date.now();
    setNowMs(now);
    const remainingMs = PROOFIG_PDF_GENERATING_STALE_MS - (now - requestedAtMs);
    if (remainingMs <= 0) return;

    // One final render at expiry is sufficient; do not continue scheduling once stale.
    const id = window.setTimeout(() => setNowMs(Date.now()), remainingMs);
    return () => window.clearTimeout(id);
  }, [proofigData?.proofigReportPdfRequestedAt]);

  useEffect(() => {
    if (regenerateFetcher.state !== 'idle' || !regenerateFetcher.data) return;
    if (lastRegenRef.current === regenerateFetcher.data) return;
    lastRegenRef.current = regenerateFetcher.data;
    const d = regenerateFetcher.data;
    if (d.error?.message) {
      ui.toastError(d.error.message);
      return;
    }
    if (d.success === true) {
      ui.toastSuccess('Regenerating Report PDF — it will be available shortly.');
      revalidator.revalidate();
    }
  }, [regenerateFetcher.state, regenerateFetcher.data, revalidator]);

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
    }
  }, [refreshFetcher.state, refreshFetcher.data, revalidator]);

  const runDownload = useCallback(async () => {
    if (!checkRunId) return;
    setDownloading(true);
    try {
      const res = await fetch(downloadHref(checkRunId), { credentials: 'same-origin' });
      if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as {
          status?: string;
          message?: string;
          reason?: string;
        } | null;
        if (body?.status === 'failed') {
          ui.toastError(body.message ?? 'PDF generation failed.');
        } else {
          ui.toastInfo(body?.message ?? 'Report PDF is still generating — try again shortly.');
        }
        revalidator.revalidate();
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        ui.toastError(body?.message ?? `Download failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition');
      let filename = PROOFIG_REPORT_FILENAME;
      if (cd) {
        const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
        if (m?.[1]) filename = m[1].trim();
      }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      ui.toastError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, [checkRunId, revalidator]);

  const canRefresh = Boolean(includeRemoteRefresh && actionPath?.trim() && workVersionId?.trim());
  const readiness = getProofigPdfReadiness(proofigData);
  const showPdfChrome = readiness !== 'not-final' && readiness !== 'no-url';

  if (!showPdfChrome && !canRefresh) return null;

  // Refresh alone — no kebab.
  if (!showPdfChrome) {
    return (
      <ProofigRefreshRemoteStatusButton
        actionPath={actionPath!.trim()}
        workVersionId={workVersionId!.trim()}
        checkRunId={checkRunId}
      />
    );
  }

  const stored = readiness === 'stored-current';
  const regenBusy =
    regenerateFetcher.state !== 'idle' ||
    isPeerRegenerateSubmitting(fetchers, checkRunId, regenerateFetcherKey);
  const refreshBusy = refreshFetcher.state !== 'idle';
  const canRegenerate = Boolean(actionPath?.trim() && workVersionId?.trim() && checkRunId?.trim());
  const attempt = getProofigPdfAttemptState(proofigData, nowMs);
  const failed = attempt.status === 'failed';
  const pdfError = failed ? attempt.error : undefined;
  // Fetcher state wins immediately; persisted attempt state covers navigation/revalidation.
  const showGenerating = regenBusy || attempt.status === 'generating';
  const showGeneratePrimary =
    !showGenerating &&
    !stored &&
    !failed &&
    (readiness === 'pending' || readiness === 'stored-stale') &&
    canRegenerate;

  const submitRegenerate = () => {
    if (!canRegenerate || blocked || regenBusy || showGenerating) return;
    const fd = new FormData();
    fd.set('intent', 'regenerate-pdf');
    fd.set('workVersionId', workVersionId!.trim());
    fd.set('checkRunId', checkRunId!.trim());
    regenerateFetcher.submit(fd, { method: 'post', action: actionPath!.trim() });
  };

  const submitRefresh = () => {
    if (!canRefresh || blocked || refreshBusy) return;
    const fd = new FormData();
    fd.set('intent', 'refresh-remote-status');
    fd.set('workVersionId', workVersionId!.trim());
    if (checkRunId) fd.set('checkRunId', checkRunId);
    refreshFetcher.submit(fd, { method: 'post', action: actionPath!.trim() });
  };

  const regenerateLabel = failed
    ? 'Retry PDF generation'
    : stored
      ? 'Regenerate PDF'
      : 'Generate PDF';

  const menuItems: ActionOverflowMenuItem[] = [];
  if (canRefresh) {
    menuItems.push({
      id: 'refresh',
      label: refreshBusy ? 'Refreshing…' : 'Refresh',
      onSelect: submitRefresh,
      disabled: blocked || refreshBusy,
    });
  }
  // Omit Generate from the kebab when it is already the primary control.
  if (canRegenerate && !showGeneratePrimary) {
    menuItems.push({
      id: 'regenerate-pdf',
      label: regenerateLabel,
      onSelect: submitRegenerate,
      // Only block while the fetcher is in flight; stale `showGenerating` is already false
      // once `proofigReportPdfRequestedAt` ages out, so stuck runs remain recoverable.
      disabled: blocked || regenBusy || showGenerating,
    });
  }

  let primary: ReactNode;
  if (showGenerating) {
    primary = (
      <span className="text-sm font-normal whitespace-nowrap opacity-50 animate-pulse text-primary">
        Generating Report PDF…
      </span>
    );
  } else if (showGeneratePrimary) {
    primary = (
      <ui.Button
        type="button"
        variant="link"
        disabled={blocked || regenBusy}
        onClick={submitRegenerate}
      >
        Generate PDF
      </ui.Button>
    );
  } else if (stored && checkRunId) {
    const download = (
      <ui.Button
        type="button"
        variant="link"
        disabled={downloading}
        onClick={() => void runDownload()}
      >
        {downloading ? 'Downloading…' : 'Download PDF report'}
      </ui.Button>
    );
    primary =
      failed && pdfError ? (
        <span className="inline-flex items-center gap-2">
          {download}
          <ui.SimpleTooltip title={pdfError} side="top">
            <span className="text-sm text-destructive cursor-help">PDF generation failed</span>
          </ui.SimpleTooltip>
        </span>
      ) : (
        download
      );
  } else if (failed) {
    const failedLabel = (
      <span className="text-sm font-normal whitespace-nowrap text-destructive">
        PDF Generation Failed
      </span>
    );
    primary = pdfError ? (
      <ui.SimpleTooltip title={pdfError} side="top">
        <span className="inline-flex cursor-help">{failedLabel}</span>
      </ui.SimpleTooltip>
    ) : (
      failedLabel
    );
  } else {
    // Defensive fallback (readiness should already be covered above).
    primary = null;
  }

  return (
    <ui.MaintenanceTooltip enabled={blocked} message={maintenanceMessage}>
      <ActionOverflow primary={primary} menuItems={menuItems} />
    </ui.MaintenanceTooltip>
  );
}
