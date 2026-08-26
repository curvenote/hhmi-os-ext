'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { ui } from '@curvenote/scms-core';

const LIST_INTENT = 'text-integrity-list-failed-runs';
const RETRY_INTENT = 'text-integrity-retry-failed-run';
const BULK_RETRY_INTENT = 'text-integrity-retry-failed-runs-bulk';
const PAGE_SIZE = 20;

type FailedRunRow = {
  id: string;
  workVersionId: string;
  workId: string;
  dateCreated: string;
  errorSummary: string;
  submitterId: string | null;
  submitterEmail: string | null;
  submitterName: string | null;
};

type ListResponse = {
  success?: boolean;
  runs?: FailedRunRow[];
  page?: number;
  pageSize?: number;
  hasNextPage?: boolean;
  scanLimitReached?: boolean;
  error?: { message?: string };
};

type RetryResponse = {
  success?: boolean;
  results?: Array<{ runId: string; ok: boolean; message?: string; checkRunId?: string }>;
  error?: { message?: string };
};

function formatSubmitter(row: FailedRunRow): string {
  if (row.submitterName?.trim()) return row.submitterName.trim();
  if (row.submitterEmail?.trim()) return row.submitterEmail.trim();
  if (row.submitterId) return row.submitterId;
  return '—';
}

export function TextIntegrityFailedRunsAdminPanel() {
  const listFetcher = useFetcher<ListResponse>();
  const retryFetcher = useFetcher<RetryResponse>();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const handledRetryRef = useRef<RetryResponse | null>(null);

  const runs = listFetcher.data?.runs ?? [];
  const listBusy = listFetcher.state !== 'idle';
  const retryBusy = retryFetcher.state !== 'idle';
  const hasNextPage = listFetcher.data?.hasNextPage === true;
  const scanLimitReached = listFetcher.data?.scanLimitReached === true;
  const currentPage = listFetcher.data?.page ?? page;

  const loadPage = useCallback(
    (targetPage: number) => {
      setPage(targetPage);
      setSelected(new Set());
      const formData = new FormData();
      formData.append('intent', LIST_INTENT);
      formData.append('page', String(targetPage));
      formData.append('pageSize', String(PAGE_SIZE));
      listFetcher.submit(formData, { method: 'post' });
    },
    [listFetcher],
  );

  useEffect(() => {
    loadPage(1);
  }, []);

  useEffect(() => {
    if (listFetcher.state !== 'idle' || !listFetcher.data?.error?.message) return;
    ui.toastError(listFetcher.data.error.message);
  }, [listFetcher.state, listFetcher.data]);

  useEffect(() => {
    if (retryFetcher.state !== 'idle' || !retryFetcher.data) return;
    if (handledRetryRef.current === retryFetcher.data) return;
    handledRetryRef.current = retryFetcher.data;

    if (retryFetcher.data.error?.message) {
      ui.toastError(retryFetcher.data.error.message);
      return;
    }

    const results = retryFetcher.data.results ?? [];
    const succeeded = results.filter((r) => r.ok).length;
    const skipped = results.filter((r) => !r.ok).length;
    if (succeeded > 0) {
      ui.toastSuccess(`Retried ${succeeded} failed run${succeeded === 1 ? '' : 's'}`);
    }
    if (skipped > 0) {
      ui.toastError(`${skipped} run${skipped === 1 ? '' : 's'} could not be retried`);
    }

    loadPage(currentPage);
  }, [retryFetcher.state, retryFetcher.data, loadPage, currentPage]);

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    if (selected.size === runs.length && runs.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(runs.map((r) => r.id)));
    }
  };

  const submitRetry = (runIds: string[]) => {
    const formData = new FormData();
    formData.append('intent', runIds.length === 1 ? RETRY_INTENT : BULK_RETRY_INTENT);
    for (const id of runIds) {
      formData.append('runIds', id);
    }
    retryFetcher.submit(formData, { method: 'post' });
  };

  return (
    <div className="p-4 space-y-4 rounded-md border border-border">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div>
          <h3 className="text-sm font-medium">Failed check runs</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Retry failed Text Integrity runs on behalf of the original submitter. Runs are skipped
            when the submitter has not accepted the current EULA. Bulk actions apply to the current
            page only.
          </p>
        </div>
        <ui.StatefulButton
          type="button"
          size="sm"
          variant="outline"
          busy={listBusy}
          disabled={listBusy}
          onClick={() => loadPage(currentPage)}
        >
          Refresh
        </ui.StatefulButton>
      </div>

      {scanLimitReached ? (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          Scan limit reached — older failed runs beyond the most recent runs are not shown.
        </p>
      ) : null}

      {listBusy && runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading failed runs…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No failed runs on this page.</p>
      ) : (
        <div className="overflow-auto max-h-80 rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr className="text-left border-b border-border">
                <th className="p-2 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === runs.length && runs.length > 0}
                    onChange={toggleAllOnPage}
                    aria-label="Select all failed runs on this page"
                  />
                </th>
                <th className="p-2">Work</th>
                <th className="p-2">Submitter</th>
                <th className="p-2">Failed</th>
                <th className="p-2">Error</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {runs.map((row) => (
                <tr key={row.id} className="border-b border-border align-top">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Select run ${row.id}`}
                    />
                  </td>
                  <td className="p-2 font-mono text-xs">{row.workId}</td>
                  <td className="p-2">{formatSubmitter(row)}</td>
                  <td className="p-2 whitespace-nowrap">
                    {new Date(row.dateCreated).toLocaleString()}
                  </td>
                  <td className="p-2 max-w-xs truncate" title={row.errorSummary}>
                    {row.errorSummary}
                  </td>
                  <td className="p-2">
                    <ui.StatefulButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      busy={retryBusy}
                      disabled={retryBusy}
                      onClick={() => submitRetry([row.id])}
                    >
                      Retry
                    </ui.StatefulButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex gap-2 items-center">
          <ui.StatefulButton
            type="button"
            size="sm"
            variant="outline"
            disabled={listBusy || currentPage <= 1}
            onClick={() => loadPage(currentPage - 1)}
          >
            Previous
          </ui.StatefulButton>
          <span className="text-sm text-muted-foreground">Page {currentPage}</span>
          <ui.StatefulButton
            type="button"
            size="sm"
            variant="outline"
            disabled={listBusy || !hasNextPage}
            onClick={() => loadPage(currentPage + 1)}
          >
            Next
          </ui.StatefulButton>
        </div>

        {selected.size > 0 ? (
          <ui.StatefulButton
            type="button"
            size="sm"
            busy={retryBusy}
            disabled={retryBusy}
            onClick={() => submitRetry([...selected])}
          >
            Retry selected on this page ({selected.size})
          </ui.StatefulButton>
        ) : null}
      </div>
    </div>
  );
}
