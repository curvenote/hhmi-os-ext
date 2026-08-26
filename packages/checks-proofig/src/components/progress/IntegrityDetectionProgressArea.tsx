import { useEffect, useState } from 'react';
import { cn, ui } from '@curvenote/scms-core';
import type { ProofigDataSchema, ProofigStage, ProofigStages } from '../../schema.js';
import { ALL_PENDING_STAGES, getStageProgressStep } from '../../schema.js';
import { ProofigRefreshRemoteStatusButton } from '../ProofigRefreshRemoteStatusButton.js';
import { SimpleErrorArea } from './SimpleErrorArea.js';
import { StageProgressArea } from './StageProgressArea.js';

const FOLLOW_UP_DELAY_MS = 5000;

export function IntegrityDetectionProgressArea({
  data,
  allStages = ALL_PENDING_STAGES,
  preparation,
  workVersionId,
  checkRunId,
  remoteStatusActionPath,
}: {
  data: ProofigStage;
  allStages?: ProofigStages;
  preparation?: ProofigDataSchema['preparation'];
  workVersionId?: string;
  checkRunId?: string;
  remoteStatusActionPath?: string;
}) {
  const { step, numSteps } = getStageProgressStep('integrityDetection', allStages, preparation);
  const [showFollowUp, setShowFollowUp] = useState(false);
  useEffect(() => {
    setShowFollowUp(false);
    const handle = setTimeout(() => setShowFollowUp(true), FOLLOW_UP_DELAY_MS);
    return () => clearTimeout(handle);
  }, [data.status]);

  if (data.status === 'error')
    return (
      <SimpleErrorArea
        step={step}
        numSteps={numSteps}
        message="Integrity detection couldn't be completed."
        data={data}
      />
    );
  if (data.status === 'notify-skipped') {
    return (
      <div className="flex flex-col gap-6">
        <ui.SimpleAlert
          type="warning"
          message={
            <div>
              <span className="font-bold">Integrity checks (notify-skipped).</span> This step was
              marked complete from a later Proofig notify without a local “processing” phase.
            </div>
          }
        />
        <StageProgressArea step={step} numSteps={numSteps} stageStartedAt={data.timestamp} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ui.SimpleAlert
        type="info"
        message={
          <div>
            <p className={cn('mt-0', { 'mb-0': !showFollowUp })}>
              <span className="font-bold">Running image integrity analysis...</span> Proofig is
              checking the integrity of your sub-images. This may take several minutes, you can
              leave this page and come back later to see the results.
            </p>
            {showFollowUp ? (
              <p className="mb-0">
                Once completed, you can review the results, confirm problems and generate a report
                as needed.
              </p>
            ) : null}
          </div>
        }
      />
      <StageProgressArea
        step={step}
        numSteps={numSteps}
        stageStartedAt={data.timestamp}
        trailingSlot={
          remoteStatusActionPath && workVersionId ? (
            <ProofigRefreshRemoteStatusButton
              actionPath={remoteStatusActionPath}
              workVersionId={workVersionId}
              checkRunId={checkRunId}
              buttonSize="sm"
            />
          ) : null
        }
      />
    </div>
  );
}
