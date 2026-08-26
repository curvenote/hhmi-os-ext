import type { TextIntegrityDataSchema } from '../schema.js';
import {
  hasError,
  getErrorMessage,
  linearStageIsDone,
  getFailedPipelineStep,
  getFailedStageDisplayTitle,
  getErrorPipelineSegmentTones,
  getRetrySupersessionInfo,
} from '../schema.js';
import { ProcessingProgressArea } from './progress/ProcessingProgressArea.js';
import { SimpleErrorArea } from './progress/SimpleErrorArea.js';
import { SubmissionCompleteProgressArea } from './progress/SubmissionCompleteProgressArea.js';
import { SubmittingProgressArea } from './progress/SubmittingProgressArea.js';
import { TextIntegrityCheckRunRetryButton } from './TextIntegrityCheckRunRetryButton.js';
import { RetriedRunNotice } from './RetriedRunNotice.js';

type ProgressRefreshProps = {
  actionPath: string;
  workVersionId: string;
  checkRunId?: string;
  checkRunDateModified?: string;
};

interface TextIntegrityProgressComponentProps {
  metadata: TextIntegrityDataSchema | undefined;
  /** POST target for relay-status refresh (extension actions route). */
  actionPath?: string;
  workVersionId?: string;
  checkRunId?: string;
  /** ISO `CheckServiceRun.date_modified` from the platform. */
  checkRunDateModified?: string;
}

export function TextIntegrityProgressComponent({
  metadata,
  actionPath,
  workVersionId,
  checkRunId,
  checkRunDateModified,
}: TextIntegrityProgressComponentProps) {
  if (!metadata?.stages) return null;

  const { submission, processing } = metadata.stages;
  const refreshProps: ProgressRefreshProps | undefined =
    actionPath && workVersionId
      ? { actionPath, workVersionId, checkRunId, checkRunDateModified }
      : undefined;

  if (hasError(metadata)) {
    const failedStep = getFailedPipelineStep(metadata) ?? 1;
    const supersession = getRetrySupersessionInfo(metadata);
    return (
      <div className="flex flex-col gap-4">
        <SimpleErrorArea
          numSteps={3}
          segmentTones={getErrorPipelineSegmentTones(metadata, 3)}
          failedStageTitle={getFailedStageDisplayTitle(failedStep)}
          error={getErrorMessage(metadata)}
        />
        {supersession ? (
          <RetriedRunNotice supersession={supersession} />
        ) : workVersionId ? (
          <TextIntegrityCheckRunRetryButton
            actionPath={actionPath}
            workVersionId={workVersionId}
            checkRunId={checkRunId}
          />
        ) : null}
      </div>
    );
  }
  if (processing?.status === 'processing') {
    return (
      <div>
        <ProcessingProgressArea {...(refreshProps ?? {})} />
      </div>
    );
  }
  if (linearStageIsDone(submission.status)) {
    return (
      <div>
        <SubmissionCompleteProgressArea {...(refreshProps ?? {})} />
      </div>
    );
  }

  return (
    <div>
      <SubmittingProgressArea {...(refreshProps ?? {})} />
    </div>
  );
}
