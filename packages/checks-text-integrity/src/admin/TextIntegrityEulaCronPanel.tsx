'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import { ui } from '@curvenote/scms-core';
import { resolveRetryCronDisplaySnapshot } from './resolveRetryCronDisplay.js';

const STATUS_INTENT = 'text-integrity-eula-cron-status';
const INSTALL_INTENT = 'text-integrity-install-eula-cron';

type EulaCronJobSummary = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  targetUrl: string | null;
  targetScope: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  nextRunAt: string | null;
};

type StatusResponse = {
  success?: boolean;
  eulaCron?: {
    installed: boolean;
    cronJob?: EulaCronJobSummary;
  };
  error?: { message?: string };
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value?.trim()) return '—';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export function TextIntegrityEulaCronPanel() {
  const statusFetcher = useFetcher<StatusResponse>();
  const installFetcher = useFetcher<StatusResponse>();
  const handledInstallRef = useRef<StatusResponse | null>(null);
  const pendingInstallStatusRefreshRef = useRef(false);
  const statusWasLoadingAfterInstallRef = useRef(false);
  const trackedInstallDataRef = useRef<StatusResponse | null>(null);

  if (
    installFetcher.state === 'idle' &&
    installFetcher.data?.success &&
    installFetcher.data.eulaCron?.installed &&
    trackedInstallDataRef.current !== installFetcher.data
  ) {
    pendingInstallStatusRefreshRef.current = true;
    statusWasLoadingAfterInstallRef.current = false;
    trackedInstallDataRef.current = installFetcher.data;
  }

  if (pendingInstallStatusRefreshRef.current && statusFetcher.state !== 'idle') {
    statusWasLoadingAfterInstallRef.current = true;
  }

  if (
    pendingInstallStatusRefreshRef.current &&
    statusWasLoadingAfterInstallRef.current &&
    statusFetcher.state === 'idle'
  ) {
    pendingInstallStatusRefreshRef.current = false;
    statusWasLoadingAfterInstallRef.current = false;
  }

  const busy = statusFetcher.state !== 'idle' || installFetcher.state !== 'idle';
  const eulaCron = resolveRetryCronDisplaySnapshot(
    statusFetcher.data?.eulaCron,
    installFetcher.data?.eulaCron,
    pendingInstallStatusRefreshRef.current,
  );
  const installed = eulaCron?.installed === true;
  const cronJob = eulaCron?.cronJob;

  const loadStatus = useCallback(() => {
    const formData = new FormData();
    formData.append('intent', STATUS_INTENT);
    statusFetcher.submit(formData, { method: 'post' });
  }, [statusFetcher]);

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (statusFetcher.state !== 'idle' || !statusFetcher.data?.error?.message) return;
    ui.toastError(statusFetcher.data.error.message);
  }, [statusFetcher.state, statusFetcher.data]);

  useEffect(() => {
    if (installFetcher.state !== 'idle' || !installFetcher.data) return;
    if (handledInstallRef.current === installFetcher.data) return;
    handledInstallRef.current = installFetcher.data;

    if (installFetcher.data.error?.message) {
      ui.toastError(installFetcher.data.error.message);
      return;
    }

    if (installFetcher.data.success) {
      if (installFetcher.data.eulaCron?.installed) {
        ui.toastSuccess('EULA refresh cron job installed');
        loadStatus();
      } else {
        ui.toastError('Install did not register the cron job');
      }
    }
  }, [installFetcher.state, installFetcher.data, loadStatus]);

  return (
    <div className="p-4 space-y-4 rounded-md border border-border">
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div>
          <h3 className="text-sm font-medium">Scheduled EULA refresh (cron)</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Cached Turnitin EULA terms can be refreshed automatically on a schedule. This requires
            the built-in <code className="text-xs">text-integrity-eula-cache-refresh</code> CronJob.
            Use <strong>Refresh EULA</strong> above for an immediate manual refresh. Schedule and
            enable/disable are managed under System → Cron after install.
          </p>
        </div>
        <ui.StatefulButton
          type="button"
          size="sm"
          variant="outline"
          busy={statusFetcher.state !== 'idle'}
          disabled={busy}
          onClick={loadStatus}
        >
          Refresh
        </ui.StatefulButton>
      </div>

      {statusFetcher.state !== 'idle' && !eulaCron ? (
        <p className="text-sm text-muted-foreground">Checking cron job…</p>
      ) : installed && cronJob ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{cronJob.enabled ? 'Installed (enabled)' : 'Installed (disabled)'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Schedule</dt>
            <dd>
              <code className="text-xs">{cronJob.schedule}</code>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Next run</dt>
            <dd>{formatTimestamp(cronJob.nextRunAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last run</dt>
            <dd>
              {formatTimestamp(cronJob.lastRunAt)}
              {cronJob.lastStatus ? ` (${cronJob.lastStatus})` : ''}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Target</dt>
            <dd className="break-all font-mono text-xs">{cronJob.targetUrl ?? '—'}</dd>
          </div>
        </dl>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-amber-700 dark:text-amber-500">
            EULA refresh cron job is not registered. Scheduled cache refreshes will not run until it
            is installed.
          </p>
          <installFetcher.Form method="post">
            <input type="hidden" name="intent" value={INSTALL_INTENT} />
            <ui.StatefulButton
              type="submit"
              size="sm"
              busy={installFetcher.state !== 'idle'}
              disabled={busy}
            >
              Install EULA refresh cron job
            </ui.StatefulButton>
          </installFetcher.Form>
        </div>
      )}
    </div>
  );
}
