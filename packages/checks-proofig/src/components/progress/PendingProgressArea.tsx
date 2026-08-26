import { ui } from '@curvenote/scms-core';
import type { ProofigStage } from '../../schema.js';
import { SimpleErrorArea } from './SimpleErrorArea.js';
import { StageProgressArea } from './StageProgressArea.js';

export function PendingProgressArea({ data }: { data: ProofigStage }) {
  if (data.status === 'error')
    return (
      <SimpleErrorArea step={0} numSteps={4} message="The check couldn't be started." data={data} />
    );

  return (
    <div className="flex flex-col gap-6">
      <ui.SimpleAlert
        type="info"
        message={
          <div>
            <span className="font-bold">Waiting to start upload...</span> connecting to Proofig and
            waiting for the upload to start.
          </div>
        }
      />
      <StageProgressArea step={0} numSteps={4} stageStartedAt={data.timestamp} />
    </div>
  );
}
