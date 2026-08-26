import { useEffect, useRef, useState } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { LoadingSpinner, ui } from '@curvenote/scms-core';
import type { TextIntegrityCredentials } from './TextIntegrityCredentialsForm.js';

const INTENT_GET_STATUS = 'text-integrity-get-status';
const INTENT_CONFIGURE_SERVICE = 'text-integrity-configure-service';

const DIALOG_PRE_CLASS =
  'overflow-auto p-3 max-h-80 font-mono text-xs whitespace-pre-wrap break-words rounded-md border bg-muted border-border';

type TestError = {
  type: string;
  message: string;
  phase?: 'relay' | 'relay_auth' | 'provider';
};

type GetStatusActionData = {
  success?: boolean;
  error?: TestError;
  status?: unknown;
  configuration?: Record<string, unknown>;
};

type ConfigureServiceActionData = {
  success?: boolean;
  error?: TestError;
  configuration?: Record<string, unknown>;
};

function phaseLabel(phase: TestError['phase']): string | undefined {
  if (phase === 'relay') return 'Checks relay';
  if (phase === 'relay_auth') return 'Checks relay authentication';
  if (phase === 'provider') return 'Service provider (via relay)';
  return undefined;
}

function jsonBlock(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

function DialogLoading({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col gap-4 justify-center items-center py-8 text-center"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner size={32} color="text-blue-600" thickness={4} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function DialogJsonPre({ value, destructive }: { value: unknown; destructive?: boolean }) {
  return (
    <pre className={destructive ? `${DIALOG_PRE_CLASS} text-destructive` : DIALOG_PRE_CLASS}>
      {jsonBlock(value)}
    </pre>
  );
}

type Props = {
  credentials: TextIntegrityCredentials;
};

export function TextIntegrityUpdateConfigurationForm({ credentials }: Props) {
  const revalidator = useRevalidator();
  const revalidateRef = useRef(revalidator.revalidate);
  revalidateRef.current = revalidator.revalidate;

  const [statusOpen, setStatusOpen] = useState(false);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [statusTab, setStatusTab] = useState('relay-status');

  const statusFetcher = useFetcher<GetStatusActionData>();
  const configureFetcher = useFetcher<ConfigureServiceActionData>();
  const configurePrevStateRef = useRef(configureFetcher.state);

  const isStatusLoading = statusFetcher.state !== 'idle';
  const isConfigureLoading = configureFetcher.state !== 'idle';

  useEffect(() => {
    if (!statusOpen) return;
    const fd = new FormData();
    fd.set('intent', INTENT_GET_STATUS);
    fd.set('serviceName', credentials.serviceName);
    fd.set('relayInstanceId', credentials.relayInstanceId);
    statusFetcher.submit(fd, { method: 'post' });
  }, [statusOpen, credentials.serviceName, credentials.relayInstanceId]);

  useEffect(() => {
    if (!configureOpen) return;
    const fd = new FormData();
    fd.set('intent', INTENT_CONFIGURE_SERVICE);
    fd.set('serviceName', credentials.serviceName);
    fd.set('relayInstanceId', credentials.relayInstanceId);
    configureFetcher.submit(fd, { method: 'post' });
  }, [configureOpen, credentials.serviceName, credentials.relayInstanceId]);

  useEffect(() => {
    if (statusOpen) setStatusTab('relay-status');
  }, [statusOpen]);

  useEffect(() => {
    const prev = configurePrevStateRef.current;
    configurePrevStateRef.current = configureFetcher.state;
    if (configureFetcher.state !== 'idle' || prev === 'idle' || !configureFetcher.data) return;

    const d = configureFetcher.data;
    if (d.error) {
      const where = phaseLabel(d.error.phase);
      ui.toastError(d.error.message, where ? { description: where } : undefined);
      return;
    }

    if (d.success) {
      revalidateRef.current();
      ui.toastSuccess('Configuration updated', {
        description: 'Service snapshot saved. Expand Service configuration info to review.',
      });
    }
  }, [configureFetcher.state, configureFetcher.data]);

  const statusData = statusFetcher.data;
  const statusReady =
    statusFetcher.state === 'idle' && statusData && !statusData.error && statusData.success;
  const statusFatalError = statusFetcher.state === 'idle' && statusData?.error;

  const configureData = configureFetcher.data;
  const configureReady =
    configureFetcher.state === 'idle' &&
    configureData &&
    !configureData.error &&
    configureData.success &&
    configureData.configuration !== undefined;
  const configureFatalError = configureFetcher.state === 'idle' && configureData?.error;

  return (
    <div className="flex flex-wrap gap-3">
      <ui.Button type="button" size="sm" onClick={() => setStatusOpen(true)}>
        Get Status
      </ui.Button>
      <ui.Button type="button" size="sm" onClick={() => setConfigureOpen(true)}>
        Configure
      </ui.Button>

      <ui.SimpleDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        title="Service status"
        description="Relay status and stored configuration from the database."
        variant="wide"
        footerButtons={[{ label: 'Close', onClick: () => setStatusOpen(false) }]}
      >
        {isStatusLoading ? <DialogLoading label="Loading status and configuration…" /> : null}

        {!isStatusLoading && statusFatalError ? (
          <DialogJsonPre value={statusFatalError} destructive />
        ) : null}

        {!isStatusLoading && statusReady ? (
          <ui.Tabs value={statusTab} onValueChange={setStatusTab} className="w-full">
            <ui.TabsList className="grid grid-cols-2 w-full">
              <ui.TabsTrigger value="relay-status">Status</ui.TabsTrigger>
              <ui.TabsTrigger value="configuration">Configuration</ui.TabsTrigger>
            </ui.TabsList>
            <ui.TabsContent value="relay-status" className="mt-3">
              <DialogJsonPre value={statusData.status} />
            </ui.TabsContent>
            <ui.TabsContent value="configuration" className="mt-3">
              <DialogJsonPre value={statusData.configuration} />
            </ui.TabsContent>
          </ui.Tabs>
        ) : null}
      </ui.SimpleDialog>

      <ui.SimpleDialog
        open={configureOpen}
        onOpenChange={setConfigureOpen}
        title="Configure service"
        description="Calls checks relay configure and status, then saves the snapshot to the database."
        variant="wide"
        footerButtons={[{ label: 'Close', onClick: () => setConfigureOpen(false) }]}
      >
        {isConfigureLoading ? (
          <DialogLoading label="Configuring service and saving snapshot…" />
        ) : null}

        {!isConfigureLoading && configureFatalError ? (
          <DialogJsonPre value={configureFatalError} destructive />
        ) : null}

        {!isConfigureLoading && configureReady ? (
          <DialogJsonPre value={configureData.configuration} />
        ) : null}
      </ui.SimpleDialog>
    </div>
  );
}
