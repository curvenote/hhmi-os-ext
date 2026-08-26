import type { ProofigDataSchema, ProofigStages } from '../schema.js';
import { ALL_PENDING_STAGES, getCurrentProofigStage, getRetrySupersessionInfo } from '../schema.js';
import { DefaultArea } from './progress/DefaultArea.js';
import { DocumentPreparationProgressArea } from './progress/DocumentPreparationProgressArea.js';
import { InitialPostProgressArea } from './progress/InitialPostProgressArea.js';
import { IntegrityDetectionProgressArea } from './progress/IntegrityDetectionProgressArea.js';
import { SubimageApprovalProgressArea } from './progress/SubimageApprovalProgressArea.js';
import { SubimageDetectionProgressArea } from './progress/SubimageDetectionProgressArea.js';
import { ResultsSummaryArea } from './ResultsSummaryArea.js';
import { ProofigCheckRunRetryButton } from './ProofigCheckRunRetryButton.js';
import { RetriedRunNotice } from './RetriedRunNotice.js';

export const STAGE_LABELS = {
  documentPreparation: 'Preparing document',
  initialPost: 'Uploading to Proofig',
  subimageDetection: 'Sub-image detection',
  subimageSelection: 'Ready for sub-image review',
  integrityDetection: 'Running integrity detection',
  resultsReview: 'Ready for results review',
  finalReport: 'Generating final report',
} as const;

function stagesHaveError(stages: ProofigStages): boolean {
  return Object.values(stages).some((stage) => {
    if (stage == null || typeof stage !== 'object') return false;
    return (stage as { status?: string }).status === 'error';
  });
}

interface ProofigProgressComponentProps {
  proofigData: ProofigDataSchema | undefined;
  workVersionId?: string;
  checkRunId?: string;
  remoteStatusActionPath?: string;
}

export function ProofigProgressComponent({
  proofigData,
  workVersionId,
  checkRunId,
  remoteStatusActionPath,
}: ProofigProgressComponentProps) {
  // Defensive: provide defaults if proofigStatus or stages don't exist
  const stages = { ...ALL_PENDING_STAGES, ...proofigData?.stages };
  const preparation = proofigData?.preparation;

  // Calculate current progress step (1-6)
  const { currentStage } = getCurrentProofigStage(stages);

  let Component = <DefaultArea />;

  if (currentStage === 'documentPreparation' && stages.documentPreparation) {
    Component = (
      <DocumentPreparationProgressArea
        data={stages.documentPreparation}
        allStages={stages}
        preparation={preparation}
      />
    );
  } else if (currentStage === 'initialPost') {
    Component = (
      <InitialPostProgressArea
        data={stages.initialPost}
        allStages={stages}
        preparation={preparation}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        remoteStatusActionPath={remoteStatusActionPath}
      />
    );
  } else if (stages.subimageDetection && currentStage === 'subimageDetection') {
    Component = (
      <SubimageDetectionProgressArea
        data={stages.subimageDetection}
        allStages={stages}
        preparation={preparation}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        remoteStatusActionPath={remoteStatusActionPath}
      />
    );
  } else if (stages.subimageSelection && currentStage === 'subimageSelection') {
    Component = (
      <SubimageApprovalProgressArea
        data={stages.subimageSelection}
        allStages={stages}
        preparation={preparation}
        reportUrl={proofigData?.reportUrl}
        deleted={proofigData?.deleted}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        remoteStatusActionPath={remoteStatusActionPath}
      />
    );
  } else if (stages.integrityDetection && currentStage === 'integrityDetection') {
    Component = (
      <IntegrityDetectionProgressArea
        data={stages.integrityDetection}
        allStages={stages}
        preparation={preparation}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        remoteStatusActionPath={remoteStatusActionPath}
      />
    );
  } else if (stages.resultsReview && currentStage === 'resultsReview') {
    Component = (
      <ResultsSummaryArea
        proofigData={proofigData}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        remoteStatusActionPath={remoteStatusActionPath}
      />
    );
  }
  const supersession = getRetrySupersessionInfo(proofigData);
  return (
    <>
      <div>{Component}</div>
      {stagesHaveError(stages) && workVersionId ? (
        <div className="mt-4">
          {supersession ? (
            <RetriedRunNotice supersession={supersession} />
          ) : (
            <ProofigCheckRunRetryButton
              actionPath={remoteStatusActionPath}
              workVersionId={workVersionId}
              checkRunId={checkRunId}
            />
          )}
        </div>
      ) : null}
    </>
  );
}
