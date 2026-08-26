'use client';

import { useEffect, useRef } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { ui } from '@curvenote/scms-core';

const INTENT_REFRESH_EULA = 'text-integrity-refresh-eula';

type RefreshEulaActionData = {
  success?: boolean;
  error?: { type: string; message: string };
  eula?: { version: string; date_fetched: string };
};

export function TextIntegrityRefreshEulaRow() {
  const fetcher = useFetcher<RefreshEulaActionData>();
  const revalidator = useRevalidator();
  const prevStateRef = useRef(fetcher.state);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = fetcher.state;
    if (fetcher.state !== 'idle' || prev === 'idle' || !fetcher.data) return;

    const d = fetcher.data;
    if (d.error?.message) {
      ui.toastError(d.error.message);
      return;
    }

    if (d.success && d.eula) {
      revalidator.revalidate();
      ui.toastSuccess('EULA cache refreshed', {
        description: `Version ${d.eula.version} (fetched ${d.eula.date_fetched}).`,
      });
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  return (
    <fetcher.Form method="post" className="inline-flex">
      <input type="hidden" name="intent" value={INTENT_REFRESH_EULA} />
      <ui.StatefulButton
        type="submit"
        disabled={fetcher.state !== 'idle'}
        size="sm"
        overlayBusy
        busy={fetcher.state !== 'idle'}
      >
        Refresh EULA
      </ui.StatefulButton>
    </fetcher.Form>
  );
}
