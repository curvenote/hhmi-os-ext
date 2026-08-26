import { ui } from '@curvenote/scms-core';
import { Logos } from '../../client.js';
import type { ProofigDataSchema, ProofigStage, ProofigStages } from '../../schema.js';
import { ALL_PENDING_STAGES, getStageProgressStep } from '../../schema.js';
import { MissingReportUrlIcon } from '../MissingReportUrlIcon.js';
import { ProofigProgressRefreshRow } from '../ProofigProgressRefreshRow.js';
import { ProofigSubimageApprovalReportLink } from '../ProofigSubimageApprovalReportLink.js';
import { ReportNoLongerAvailable } from '../ReportNoLongerAvailable.js';
import { SimpleErrorArea } from './SimpleErrorArea.js';
import { StageProgressArea } from './StageProgressArea.js';

export function SubimageApprovalProgressArea({
  data,
  allStages = ALL_PENDING_STAGES,
  preparation,
  reportUrl,
  deleted,
  workVersionId,
  checkRunId,
  remoteStatusActionPath,
}: {
  data: ProofigStage;
  allStages?: ProofigStages;
  preparation?: ProofigDataSchema['preparation'];
  reportUrl?: string;
  deleted?: boolean;
  workVersionId?: string;
  checkRunId?: string;
  remoteStatusActionPath?: string;
}) {
  const { step, numSteps } = getStageProgressStep('subimageSelection', allStages, preparation);
  if (data.status === 'error')
    return (
      <SimpleErrorArea
        step={step}
        numSteps={numSteps}
        message="Sub-image review couldn't be completed."
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
              <span className="font-bold">Sub-image approval (notify-skipped).</span> Our timeline
              was updated from a later Proofig state without the usual approval notification.
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
        type="warning"
        message={
          <div>
            <p className="mt-0">
              <span className="font-bold">Please approve figure sub-images.</span> Proofig will
              attempt to detect sub-images including gels, blots and and microscopy images. You must
              review, correct and approve the sub-images before proceeding to integrity checking.
            </p>
            <p className="mb-0">
              Once you approve the sub-images in Proofig, please close the tab and return here to
              continue. Press the button below to proceed.
            </p>
          </div>
        }
      />
      <StageProgressArea
        step={step}
        numSteps={numSteps}
        state="success"
        stageStartedAt={data.timestamp}
        label="Updated"
      />
      <div className="flex flex-wrap gap-2 items-center w-full min-w-0">
        {deleted ? (
          <ReportNoLongerAvailable />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 items-center min-w-0">
              {!reportUrl && <MissingReportUrlIcon />}
              <ProofigSubimageApprovalReportLink
                reportUrl={reportUrl ?? ''}
                actionPath={remoteStatusActionPath}
                workVersionId={workVersionId}
                checkRunId={checkRunId}
                disabled={!reportUrl}
              >
                <div className="flex gap-1 items-center">
                  <div>Approve sub-images at</div>
                  <Logos.LogoMono className="h-7" />
                </div>
              </ProofigSubimageApprovalReportLink>
            </div>
            <div className="flex-1 min-h-px min-w-4 basis-4" aria-hidden />
            <ProofigProgressRefreshRow
              remoteStatusActionPath={remoteStatusActionPath}
              workVersionId={workVersionId}
              checkRunId={checkRunId}
            />
          </>
        )}
      </div>
    </div>
  );
}
