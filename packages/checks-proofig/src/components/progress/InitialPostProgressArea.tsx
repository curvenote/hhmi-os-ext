import { ui } from '@curvenote/scms-core';
import type { ProofigDataSchema, ProofigStage, ProofigStages } from '../../schema.js';
import {
  ALL_PENDING_STAGES,
  getStageProgressStep,
  shouldShowDocxPreparationCompleteNote,
} from '../../schema.js';
import { ProofigRefreshRemoteStatusButton } from '../ProofigRefreshRemoteStatusButton.js';
import { DocxPreparationCompleteNote } from './DocxPreparationCompleteNote.js';
import { DefaultArea } from './DefaultArea.js';
import { SimpleErrorArea } from './SimpleErrorArea.js';
import { StageProgressArea } from './StageProgressArea.js';

export function InitialPostProgressArea({
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
  const { step, numSteps } = getStageProgressStep('initialPost', allStages, preparation);
  const showPrepNote = shouldShowDocxPreparationCompleteNote(preparation, allStages);
  const refreshButton =
    remoteStatusActionPath && workVersionId ? (
      <ProofigRefreshRemoteStatusButton
        actionPath={remoteStatusActionPath}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        buttonSize="sm"
      />
    ) : null;

  switch (data.status) {
    case 'pending':
      return (
        <div className="flex flex-col gap-6">
          <ui.SimpleAlert
            type="info"
            message={
              <div>
                <span className="font-bold">Connecting to service...</span> connecting to the
                service and authorizing the check.
              </div>
            }
          />
          <StageProgressArea
            step={step}
            numSteps={numSteps}
            stageStartedAt={data.timestamp}
            trailingSlot={refreshButton}
          />
          {showPrepNote ? <DocxPreparationCompleteNote /> : null}
        </div>
      );
    case 'processing':
      return (
        <div className="flex flex-col gap-6">
          <ui.SimpleAlert
            type="info"
            message={
              <div>
                <span className="font-bold">Uploading to Proofig...</span> submitting your work to
                proofig for processing. Large files may take longer to submit.
              </div>
            }
          />
          <StageProgressArea
            step={step}
            numSteps={numSteps}
            stageStartedAt={data.timestamp}
            trailingSlot={refreshButton}
          />
          {showPrepNote ? <DocxPreparationCompleteNote /> : null}
        </div>
      );
    case 'completed':
      return (
        <div className="flex flex-col gap-6">
          <ui.SimpleAlert
            type="info"
            message={
              <div>
                <span className="font-bold">Upload complete.</span> waiting for confirmation that
                processing has started.
              </div>
            }
          />
          <StageProgressArea
            step={step}
            numSteps={numSteps}
            stageStartedAt={data.timestamp}
            trailingSlot={refreshButton}
          />
          {showPrepNote ? <DocxPreparationCompleteNote /> : null}
        </div>
      );
    case 'error':
      return (
        <SimpleErrorArea
          step={step}
          numSteps={numSteps}
          message="We couldn't upload your document to Proofig."
          data={data}
        />
      );
  }
  return <DefaultArea />;
}
