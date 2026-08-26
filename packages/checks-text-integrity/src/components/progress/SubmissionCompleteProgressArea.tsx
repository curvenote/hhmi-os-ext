import { ui } from '@curvenote/scms-core';
import { TextIntegrityRefreshRemoteStatusButton } from '../TextIntegrityRefreshRemoteStatusButton.js';
import { StageProgressArea } from './StageProgressArea.js';
import { useCheckRunStale } from './useCheckRunStale.js';

export type SubmissionCompleteProgressAreaProps = {
  actionPath?: string;
  workVersionId?: string;
  checkRunId?: string;
  checkRunDateModified?: string;
};

export function SubmissionCompleteProgressArea({
  actionPath,
  workVersionId,
  checkRunId,
  checkRunDateModified,
}: SubmissionCompleteProgressAreaProps) {
  const showStaleUi = useCheckRunStale(checkRunDateModified);

  const refreshSlot =
    showStaleUi && actionPath && workVersionId ? (
      <TextIntegrityRefreshRemoteStatusButton
        actionPath={actionPath}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
      />
    ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <ui.SimpleAlert
        type="info"
        message={
          <div>
            <span className="font-bold">Submission complete.</span> Waiting for confirmation that
            processing has started.
            {showStaleUi ? (
              <p className="mt-2 mb-0 font-normal text-muted-foreground">
                This run has not been updated recently. Use{' '}
                <span className="font-medium text-foreground">Refresh status</span> next to the
                progress line if a notification was delayed.
              </p>
            ) : null}
          </div>
        }
      />
      <StageProgressArea
        step={2}
        numSteps={3}
        message="File received and queued for processing…"
        trailingSlot={refreshSlot}
      />
    </div>
  );
}
