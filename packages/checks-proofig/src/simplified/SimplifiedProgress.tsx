import type { ProofigDataSchema } from '../schema.js';
import { ALL_PENDING_STAGES, getCurrentProofigStage } from '../schema.js';
import { SimplifiedDocumentPreparation } from './SimplifiedDocumentPreparation.js';
import { SimplifiedInitialPost } from './SimplifiedInitialPost.js';
import { SimplifiedSubimageDetection } from './SimplifiedSubimageDetection.js';
import { SimplifiedSubimageApproval } from './SimplifiedSubimageApproval.js';
import { SimplifiedIntegrityDetection } from './SimplifiedIntegrityDetection.js';
import { SimplifiedResultsSummary } from './SimplifiedResultsSummary.js';
import { SimplifiedDefault } from './SimplifiedDefault.js';

interface SimplifiedProgressProps {
  proofigData: ProofigDataSchema | undefined;
  workVersionId?: string;
  checkRunId?: string;
  remoteStatusActionPath?: string;
}

export function SimplifiedProgress({
  proofigData,
  workVersionId,
  checkRunId,
  remoteStatusActionPath,
}: SimplifiedProgressProps) {
  const stages = { ...ALL_PENDING_STAGES, ...proofigData?.stages };
  const { currentStage } = getCurrentProofigStage(stages);

  if (currentStage === 'documentPreparation' && stages.documentPreparation) {
    return <SimplifiedDocumentPreparation data={stages.documentPreparation} />;
  }
  if (currentStage === 'initialPost') {
    return (
      <SimplifiedInitialPost
        data={stages.initialPost}
        allStages={stages}
        preparation={proofigData?.preparation}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        remoteStatusActionPath={remoteStatusActionPath}
      />
    );
  }
  if (stages.subimageDetection && currentStage === 'subimageDetection') {
    return (
      <SimplifiedSubimageDetection
        data={stages.subimageDetection}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        remoteStatusActionPath={remoteStatusActionPath}
      />
    );
  }
  if (stages.subimageSelection && currentStage === 'subimageSelection') {
    return (
      <SimplifiedSubimageApproval
        data={stages.subimageSelection}
        reportUrl={proofigData?.reportUrl}
        deleted={proofigData?.deleted}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        remoteStatusActionPath={remoteStatusActionPath}
      />
    );
  }
  if (stages.integrityDetection && currentStage === 'integrityDetection') {
    return (
      <SimplifiedIntegrityDetection
        data={stages.integrityDetection}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        remoteStatusActionPath={remoteStatusActionPath}
      />
    );
  }
  if (stages.resultsReview && currentStage === 'resultsReview') {
    return (
      <SimplifiedResultsSummary
        proofigData={proofigData}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        remoteStatusActionPath={remoteStatusActionPath}
      />
    );
  }
  return <SimplifiedDefault />;
}
