import type { ProofigStage } from '../schema.js';
import { ui } from '@curvenote/scms-core';
import { ProofigProgressRefreshRow } from '../components/ProofigProgressRefreshRow.js';
import { SimplifiedError } from './SimplifiedError.js';
import { SimplifiedProgressAlertMessage } from './SimplifiedProgressAlertMessage.js';

export function SimplifiedIntegrityDetection({
  data,
  workVersionId,
  checkRunId,
  remoteStatusActionPath,
}: {
  data: ProofigStage;
  workVersionId?: string;
  checkRunId?: string;
  remoteStatusActionPath?: string;
}) {
  if (data.status === 'error') {
    return <SimplifiedError data={data} message="Integrity detection failed" />;
  }

  return (
    <div className="space-y-2">
      <ui.SimpleAlert
        type="info"
        message={<SimplifiedProgressAlertMessage text="Running integrity checks…" />}
      />
      <ProofigProgressRefreshRow
        remoteStatusActionPath={remoteStatusActionPath}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
      />
    </div>
  );
}
