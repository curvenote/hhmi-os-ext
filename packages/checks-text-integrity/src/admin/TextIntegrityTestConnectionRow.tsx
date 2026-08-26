import { useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import { ui } from '@curvenote/scms-core';
import type { TextIntegrityCredentials } from './TextIntegrityCredentialsForm.js';

const INTENT_TEST = 'text-integrity-test-connection';

type TestError = {
  type: string;
  message: string;
  phase?: 'relay' | 'relay_auth' | 'provider';
};

type TestActionData = {
  error?: TestError;
  success?: boolean;
};

function phaseLabel(phase: TestError['phase']): string | undefined {
  if (phase === 'relay') return 'Checks relay';
  if (phase === 'relay_auth') return 'Checks relay authentication';
  if (phase === 'provider') return 'Service provider (via relay)';
  return undefined;
}

type Props = {
  credentials: TextIntegrityCredentials;
};

export function TextIntegrityTestConnectionRow({ credentials }: Props) {
  const testFetcher = useFetcher<TestActionData>();
  const testPrevStateRef = useRef(testFetcher.state);

  const isTesting = testFetcher.state !== 'idle';

  useEffect(() => {
    const prev = testPrevStateRef.current;
    testPrevStateRef.current = testFetcher.state;
    if (testFetcher.state !== 'idle' || prev === 'idle' || !testFetcher.data) return;

    const d = testFetcher.data;
    if (d.error) {
      const where = phaseLabel(d.error.phase);
      ui.toastError(d.error.message, where ? { description: where } : undefined);
      return;
    }

    if (d.success) {
      ui.toastSuccess('Service connection OK', {
        description: 'Service called via checks relay.',
      });
    }
  }, [testFetcher.state, testFetcher.data]);

  return (
    <testFetcher.Form method="post" className="flex flex-wrap gap-3 items-center">
      <input type="hidden" name="intent" value={INTENT_TEST} />
      <input type="hidden" name="serviceName" value={credentials.serviceName} />
      <input type="hidden" name="relayInstanceId" value={credentials.relayInstanceId} />
      <ui.StatefulButton type="submit" disabled={isTesting} size="sm" overlayBusy busy={isTesting}>
        Test connection
      </ui.StatefulButton>
    </testFetcher.Form>
  );
}
