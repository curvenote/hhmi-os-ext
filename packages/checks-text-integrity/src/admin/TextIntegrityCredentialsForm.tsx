import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useFetcher } from 'react-router';
import { ui } from '@curvenote/scms-core';

const INTENT_SAVE_AUTH = 'text-integrity-save-auth';

type SaveActionData = {
  error?: { type: string; message: string };
  success?: boolean;
};

export type TextIntegrityCredentials = {
  /** Merged extension YAML + object-store override; empty save clears stored override. */
  serviceName: string;
  /** Merged extension YAML + object-store override; empty save clears stored override. */
  relayInstanceId: string;
};

type Props = {
  displayConfig: Record<string, unknown>;
  /** Called whenever service name or relay instance changes (ref-safe; parent need not memoize). */
  onCredentialsChange: (c: TextIntegrityCredentials) => void;
};

function readStringField(config: Record<string, unknown>, key: string): string {
  const v = config[key];
  return typeof v === 'string' ? v : '';
}

export function TextIntegrityCredentialsForm({ displayConfig, onCredentialsChange }: Props) {
  const initialServiceName = readStringField(displayConfig, 'serviceName');
  const initialRelayInstanceId = readStringField(displayConfig, 'relayInstanceId');
  const [serviceName, setServiceName] = useState(initialServiceName);
  const [relayInstanceId, setRelayInstanceId] = useState(initialRelayInstanceId);

  const saveFetcher = useFetcher<SaveActionData>();
  const savePrevStateRef = useRef(saveFetcher.state);
  const onCredentialsChangeRef = useRef(onCredentialsChange);
  onCredentialsChangeRef.current = onCredentialsChange;

  useEffect(() => {
    setServiceName(readStringField(displayConfig, 'serviceName'));
  }, [displayConfig.serviceName]);

  useEffect(() => {
    setRelayInstanceId(readStringField(displayConfig, 'relayInstanceId'));
  }, [displayConfig.relayInstanceId]);

  useEffect(() => {
    onCredentialsChangeRef.current({ serviceName, relayInstanceId });
  }, [serviceName, relayInstanceId]);

  useEffect(() => {
    const prev = savePrevStateRef.current;
    savePrevStateRef.current = saveFetcher.state;
    if (saveFetcher.state !== 'idle' || prev === 'idle' || !saveFetcher.data) return;

    const d = saveFetcher.data;
    if (d.error) {
      ui.toastError(d.error.message);
    } else if (d.success) {
      ui.toastSuccess('Settings saved');
    }
  }, [saveFetcher.state, saveFetcher.data]);

  const isSaving = saveFetcher.state !== 'idle';
  const fieldsDisabled = isSaving;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Service URLs and provider API credentials for checks are configured on{' '}
        <span className="font-medium">checks-relay</span> per instance. Service name and instance id
        come from the values set for this deployment unless overridden here.
      </p>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="ti-service-name">
          Service name
        </label>
        <ui.TextField
          id="ti-service-name"
          name="serviceName"
          value={serviceName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setServiceName(e.target.value)}
          placeholder="echo"
          disabled={fieldsDisabled}
          className="w-full font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Checks-relay plugin id (first segment under{' '}
          <span className="font-mono">/api/v1/services/</span>
          ). Set in extension YAML or here. Leave blank and save to clear a stored override (YAML or
          default <span className="font-mono">echo</span>).
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="ti-relay-instance">
          Checks relay instance id
        </label>
        <ui.TextField
          id="ti-relay-instance"
          name="relayInstanceId"
          value={relayInstanceId}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setRelayInstanceId(e.target.value)}
          placeholder="default"
          disabled={fieldsDisabled}
          className="w-full font-mono"
        />
        <p className="text-xs text-muted-foreground">
          URL segment for checks-relay (paths include <span className="font-mono">/instances/</span>
          ). Set in extension YAML or here. Leave blank and save to clear a stored override, then
          extension YAML or the literal <span className="font-mono">default</span>.
        </p>
      </div>

      <saveFetcher.Form method="post" className="pt-1">
        <input type="hidden" name="intent" value={INTENT_SAVE_AUTH} />
        <input type="hidden" name="serviceName" value={serviceName} />
        <input type="hidden" name="relayInstanceId" value={relayInstanceId} />
        <ui.StatefulButton
          type="submit"
          disabled={fieldsDisabled}
          size="sm"
          overlayBusy
          busy={isSaving}
        >
          Save changes
        </ui.StatefulButton>
      </saveFetcher.Form>
    </div>
  );
}
