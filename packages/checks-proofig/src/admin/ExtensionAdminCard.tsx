import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import type { CheckMaintenanceRecord, ExtensionAdminCardProps } from '@curvenote/scms-core';
import { ui, CheckMaintenanceAdminPanel } from '@curvenote/scms-core';
import { Logo } from '../icons.js';
import { ProofigFailedRunsAdminPanel } from './FailedRunsAdminPanel.js';

const INTENT_BASE_URL = 'proofig-set-baseurl';
const INTENT_CLIENT_ID = 'proofig-set-client-id';
const INTENT_CLIENT_SECRET = 'proofig-set-client-secret';

type ActionData = {
  error?: { type: string; message: string };
};

function ConfigTable({ record }: { record?: Record<string, unknown> }) {
  if (!record || Object.keys(record).length === 0) {
    return <p className="font-mono text-sm text-muted-foreground">No configuration loaded.</p>;
  }
  return (
    <table className="w-full font-mono text-sm border-collapse">
      <tbody>
        {Object.entries(record).map(([key, value]) => (
          <tr key={key} className="border-b border-border">
            <td className="py-1.5 pr-4 text-muted-foreground align-top">{key}</td>
            <td className="py-1.5 break-all">
              {value === null || value === undefined
                ? '—'
                : typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FieldFormRow({
  label,
  intent,
  initialValue,
  placeholder,
  disabled,
  inputType = 'text',
}: {
  label: string;
  intent: string;
  initialValue: string;
  placeholder?: string;
  disabled?: boolean;
  inputType?: 'text' | 'password';
}) {
  const fetcher = useFetcher<ActionData>();
  const [value, setValue] = useState(initialValue);
  const isSubmitting = fetcher.state !== 'idle';

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.error) {
      ui.toastError(fetcher.data.error.message);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="flex flex-wrap gap-2 items-end">
      <div className="flex-1 space-y-1 min-w-0">
        <label className="text-sm font-medium">{label}</label>
        <fetcher.Form method="post" className="flex flex-wrap gap-2 items-center">
          <input type="hidden" name="intent" value={intent} />
          <ui.TextField
            type={inputType}
            name="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            disabled={disabled ?? isSubmitting}
            className="font-mono flex-1 min-w-[200px]"
          />
          <ui.StatefulButton
            type="submit"
            disabled={isSubmitting}
            size="sm"
            overlayBusy
            busy={isSubmitting}
          >
            Save
          </ui.StatefulButton>
        </fetcher.Form>
      </div>
    </div>
  );
}

function ExtensionAdminCard({ record }: ExtensionAdminCardProps) {
  // record is the effective config from the platform loader (getExtensionConfiguration → getSafeAdminConfig).
  // It already includes object-table overrides. Revalidation after save refreshes it.
  const displayConfig = record ?? {};
  const apiBaseUrl = typeof displayConfig.apiBaseUrl === 'string' ? displayConfig.apiBaseUrl : '';
  const clientId = typeof displayConfig.clientId === 'string' ? displayConfig.clientId : '';

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-6">
      <div className="flex gap-3 justify-between items-center min-w-0 md:justify-start md:col-span-2">
        <h2 className="text-xl font-semibold">Checks: Proofig</h2>
        <div className="flex gap-2 items-center grow"></div>
        <Logo className="h-8 shrink-0" />
      </div>

      <div className="space-y-2 md:col-span-2">
        <p className="text-sm font-medium text-muted-foreground">Configuration</p>
        <div className="overflow-auto p-3 max-h-64 rounded-md bg-muted">
          <ConfigTable record={displayConfig} />
        </div>
      </div>

      <div className="space-y-4 md:col-span-2">
        <p className="text-sm font-medium text-muted-foreground">Update settings</p>
        <div className="space-y-4">
          <FieldFormRow
            label="apiBaseUrl"
            intent={INTENT_BASE_URL}
            initialValue={apiBaseUrl}
            placeholder="https://api.proofig.example"
          />
          <FieldFormRow
            label="clientId"
            intent={INTENT_CLIENT_ID}
            initialValue={clientId}
            placeholder="Client ID"
          />
          <FieldFormRow
            label="clientSecret"
            intent={INTENT_CLIENT_SECRET}
            initialValue=""
            placeholder="Leave empty to keep current"
            inputType="password"
          />
        </div>
      </div>

      <div className="md:col-span-2">
        <CheckMaintenanceAdminPanel
          intent="proofig-set-maintenance"
          maintenance={displayConfig.maintenance as CheckMaintenanceRecord | undefined}
          serviceLabel="Proofig"
        />
      </div>

      <ProofigFailedRunsAdminPanel />
    </div>
  );
}

export default ExtensionAdminCard;
