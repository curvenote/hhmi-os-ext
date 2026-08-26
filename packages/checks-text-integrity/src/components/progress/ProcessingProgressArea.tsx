import { ui } from '@curvenote/scms-core';
import { TextIntegrityRefreshRemoteStatusButton } from '../TextIntegrityRefreshRemoteStatusButton.js';
import { StageProgressArea } from './StageProgressArea.js';
import { useCheckRunStale } from './useCheckRunStale.js';

const PROCESSING_STALE_AFTER_MS = 45_000;

export type ProcessingProgressAreaProps = {
  actionPath?: string;
  workVersionId?: string;
  checkRunId?: string;
  checkRunDateModified?: string;
};

export function ProcessingProgressArea({
  actionPath,
  workVersionId,
  checkRunId,
  checkRunDateModified,
}: ProcessingProgressAreaProps) {
  const showStaleUi = useCheckRunStale(checkRunDateModified, {
    staleAfterMs: PROCESSING_STALE_AFTER_MS,
  });

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
            <p className="mt-0">
              <span className="font-bold">Processing your submission...</span> Your documents are
              being analysed and large files may take longer to process.
            </p>
            {showStaleUi ? (
              <p className="mt-2 mb-0 text-muted-foreground">
                This run has not been updated recently. You can leave and return later; use{' '}
                <span className="font-medium text-foreground">Refresh status</span> next to the
                progress line if updates look stuck.
              </p>
            ) : null}
          </div>
        }
      />
      <StageProgressArea
        step={3}
        numSteps={3}
        message="This may take several minutes…"
        trailingSlot={refreshSlot}
      />
    </div>
  );
}
