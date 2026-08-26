'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { ui } from '@curvenote/scms-core';
import { TextIntegrityTrackEvent } from '../analytics.catalog.js';
import { useChecksPingEvent } from '@hhmi/checks-shared/analytics/client';
import { TEXT_INTEGRITY_CHECKS_ACTION_PATH } from '../client.js';

type EulaStatusPayload = {
  requireEula?: boolean;
  accepted?: boolean;
  eula?: { version?: string; html?: string; url?: string };
  error?: { message?: string };
  success?: boolean;
};

const EULA_DEBUG_LABEL = '[checks-text-integrity:eula-enable]';

function logEulaDebug(message: string, details?: Record<string, unknown>) {
  console.info(EULA_DEBUG_LABEL, message, details ?? {});
}

function logEulaError(message: string, details?: Record<string, unknown>) {
  console.error(EULA_DEBUG_LABEL, message, details ?? {});
}

export function useTextIntegrityEulaEnable(workVersionId: string) {
  const pingEvent = useChecksPingEvent({
    checkKind: 'checks-text-integrity',
    workVersionId,
  });
  const statusFetcher = useFetcher<EulaStatusPayload>();
  const acceptFetcher = useFetcher<EulaStatusPayload>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eulaPresentation, setEulaPresentation] = useState<{
    version: string;
    html?: string;
    url?: string;
  } | null>(null);
  const pendingEnableRef = useRef<(() => void) | null>(null);

  const loadStatus = useCallback(() => {
    const formData = new FormData();
    formData.append('intent', 'checks-text-integrity:eula-status');
    formData.append('workVersionId', workVersionId);
    logEulaDebug('submitting EULA status request', {
      action: TEXT_INTEGRITY_CHECKS_ACTION_PATH,
      workVersionId,
      currentUrl: window.location.href,
      online: navigator.onLine,
    });
    statusFetcher.submit(formData, {
      method: 'post',
      action: TEXT_INTEGRITY_CHECKS_ACTION_PATH,
    });
  }, [statusFetcher, workVersionId]);

  const requestEnable = useCallback(
    (onEnabled: () => void) => {
      logEulaDebug('enable requested', {
        workVersionId,
        statusFetcherState: statusFetcher.state,
        acceptFetcherState: acceptFetcher.state,
      });
      void pingEvent(TextIntegrityTrackEvent.CHECKS_EULA_STATUS_REQUESTED, {});
      pendingEnableRef.current = onEnabled;
      loadStatus();
    },
    [acceptFetcher.state, loadStatus, pingEvent, statusFetcher.state, workVersionId],
  );

  useEffect(() => {
    if (statusFetcher.state !== 'idle' || !statusFetcher.data || !pendingEnableRef.current) {
      return;
    }
    const data = statusFetcher.data;
    logEulaDebug('received EULA status response', {
      workVersionId,
      data,
    });

    if (data.error?.message) {
      logEulaError('EULA status returned error', {
        workVersionId,
        data,
      });
      ui.toastError(data.error.message);
      pendingEnableRef.current = null;
      return;
    }
    if (!data.requireEula || data.accepted) {
      logEulaDebug('EULA already accepted; running pending action', {
        workVersionId,
        requireEula: data.requireEula,
        accepted: data.accepted,
      });
      const run = pendingEnableRef.current;
      pendingEnableRef.current = null;
      run();
      return;
    }
    const version = data.eula?.version;
    if (!version) {
      logEulaError('EULA status missing version', {
        workVersionId,
        data,
      });
      ui.toastError('EULA version is unavailable. Try again later.');
      pendingEnableRef.current = null;
      return;
    }
    logEulaDebug('opening EULA dialog', {
      workVersionId,
      version,
      hasHtml: Boolean(data.eula?.html),
      url: data.eula?.url,
    });
    void pingEvent(TextIntegrityTrackEvent.CHECKS_EULA_DIALOG_OPENED, { eulaVersion: version });
    setEulaPresentation({
      version,
      html: data.eula?.html,
      url: data.eula?.url,
    });
    setDialogOpen(true);
  }, [statusFetcher.state, statusFetcher.data, workVersionId]);

  useEffect(() => {
    if (acceptFetcher.state !== 'idle' || !acceptFetcher.data) return;
    logEulaDebug('received EULA accept response', {
      workVersionId,
      data: acceptFetcher.data,
    });
    if (acceptFetcher.data.error?.message) {
      logEulaError('EULA accept returned error', {
        workVersionId,
        data: acceptFetcher.data,
      });
      ui.toastError(acceptFetcher.data.error.message);
      return;
    }
    if (!acceptFetcher.data.success) return;
    setDialogOpen(false);
    setEulaPresentation(null);
    const run = pendingEnableRef.current;
    pendingEnableRef.current = null;
    run?.();
  }, [acceptFetcher.state, acceptFetcher.data]);

  const acceptEula = useCallback(
    (params: { version: string; language: string }) => {
      const formData = new FormData();
      formData.append('intent', 'checks-text-integrity:accept-eula');
      formData.append('workVersionId', workVersionId);
      formData.append('version', params.version);
      formData.append('language', params.language);
      logEulaDebug('submitting EULA accept request', {
        action: TEXT_INTEGRITY_CHECKS_ACTION_PATH,
        workVersionId,
        version: params.version,
        language: params.language,
      });
      acceptFetcher.submit(formData, {
        method: 'post',
        action: TEXT_INTEGRITY_CHECKS_ACTION_PATH,
      });
    },
    [acceptFetcher, workVersionId],
  );

  const cancelDialog = useCallback(() => {
    void pingEvent(TextIntegrityTrackEvent.CHECKS_EULA_DECLINED, {});
    setDialogOpen(false);
    setEulaPresentation(null);
    pendingEnableRef.current = null;
  }, [pingEvent]);

  return {
    dialogOpen,
    setDialogOpen: (open: boolean) => {
      if (!open) cancelDialog();
      else setDialogOpen(true);
    },
    eulaPresentation,
    requestEnable,
    acceptEula,
    busy: statusFetcher.state !== 'idle' || acceptFetcher.state !== 'idle',
  };
}
