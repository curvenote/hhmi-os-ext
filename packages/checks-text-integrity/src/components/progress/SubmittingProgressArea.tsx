import { ui } from '@curvenote/scms-core';
import { TextIntegrityRefreshRemoteStatusButton } from '../TextIntegrityRefreshRemoteStatusButton.js';
import { StageProgressArea } from './StageProgressArea.js';
import { useCheckRunStale } from './useCheckRunStale.js';

const DEFAULT_SERVICE_NAME = 'Text Integrity';

export type SubmittingProgressAreaProps = {
  /** When set, shown instead of “Text Integrity” in the upload headline (e.g. branded provider name). */
  name?: string;
  actionPath?: string;
  workVersionId?: string;
  checkRunId?: string;
  /** ISO `CheckServiceRun.date_modified` — stale when older than the configured stale threshold. */
  checkRunDateModified?: string;
};

export function SubmittingProgressArea({
  name,
  actionPath,
  workVersionId,
  checkRunId,
  checkRunDateModified,
}: SubmittingProgressAreaProps) {
  const serviceName = name?.trim() || DEFAULT_SERVICE_NAME;
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
            <span className="font-bold">Uploading to {serviceName}…</span> submitting your work for
            processing. Large files may take longer to submit.
            {showStaleUi ? (
              <p className="mt-2 mb-0 font-normal text-muted-foreground">
                This run has not been updated recently. Use{' '}
                <span className="font-medium text-foreground">Refresh status</span> next to the
                progress line if an update was missed, or leave this page and come back later.
              </p>
            ) : null}
          </div>
        }
      />
      <StageProgressArea
        step={1}
        numSteps={3}
        message="Usually takes less than 30 seconds…"
        trailingSlot={refreshSlot}
      />
    </div>
  );
}
