import type { ProofigStage } from '../schema.js';
import { ui } from '@curvenote/scms-core';
import { LogoMono } from '../icons.js';
import { ReportNoLongerAvailable } from '../components/ReportNoLongerAvailable.js';
import { ProofigRefreshRemoteStatusButton } from '../components/ProofigRefreshRemoteStatusButton.js';
import { ProofigSubimageApprovalReportLink } from '../components/ProofigSubimageApprovalReportLink.js';
import { SimplifiedError } from './SimplifiedError.js';

export function SimplifiedSubimageApproval({
  data,
  reportUrl,
  deleted,
  workVersionId,
  checkRunId,
  remoteStatusActionPath,
}: {
  data: ProofigStage;
  reportUrl?: string;
  deleted?: boolean;
  workVersionId?: string;
  checkRunId?: string;
  remoteStatusActionPath?: string;
}) {
  if (data.status === 'error') {
    return <SimplifiedError data={data} message="Subimage selection failed" />;
  }
  return (
    <div className="space-y-2">
      <ui.SimpleAlert
        type="warning"
        message="Awaiting sub-image approval. Please review and confirm in Proofig."
      />
      <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
        {deleted ? (
          <ReportNoLongerAvailable />
        ) : (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {reportUrl ? (
                <ProofigSubimageApprovalReportLink
                  reportUrl={reportUrl}
                  actionPath={remoteStatusActionPath}
                  workVersionId={workVersionId}
                  checkRunId={checkRunId}
                >
                  <span className="flex gap-2 items-center">
                    <span>Open report in</span>
                    <LogoMono className="h-7" />
                  </span>
                </ProofigSubimageApprovalReportLink>
              ) : null}
            </div>
            <div className="min-h-px min-w-4 flex-1 basis-4" aria-hidden />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {remoteStatusActionPath && workVersionId ? (
                <ProofigRefreshRemoteStatusButton
                  actionPath={remoteStatusActionPath}
                  workVersionId={workVersionId}
                  checkRunId={checkRunId}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
