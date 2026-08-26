import type { ProofigStage } from '../schema.js';
import { ui } from '@curvenote/scms-core';
import { ProofigProgressRefreshRow } from '../components/ProofigProgressRefreshRow.js';
import { SimplifiedError } from './SimplifiedError.js';
import { SimplifiedProgressAlertMessage } from './SimplifiedProgressAlertMessage.js';

export function SimplifiedSubimageDetection({
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
    return <SimplifiedError data={data} message="Subimage detection failed" />;
  }
  const refresh = (
    <ProofigProgressRefreshRow
      remoteStatusActionPath={remoteStatusActionPath}
      workVersionId={workVersionId}
      checkRunId={checkRunId}
    />
  );
  if (data.status === 'pending') {
    return (
      <div className="space-y-2">
        <ui.SimpleAlert
          type="info"
          message={<SimplifiedProgressAlertMessage text="Subimage detection pending…" />}
        />
        {refresh}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ui.SimpleAlert
        type="info"
        message={<SimplifiedProgressAlertMessage text="Identifying sub-images…" />}
      />
      {refresh}
    </div>
  );
}
