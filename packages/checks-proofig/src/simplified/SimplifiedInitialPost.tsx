import type { ProofigDataSchema, ProofigStage, ProofigStages } from '../schema.js';
import { ALL_PENDING_STAGES, shouldShowDocxPreparationCompleteNote } from '../schema.js';
import { ui } from '@curvenote/scms-core';
import { DocxPreparationCompleteNote } from '../components/progress/DocxPreparationCompleteNote.js';
import { ProofigProgressRefreshRow } from '../components/ProofigProgressRefreshRow.js';
import { SimplifiedError } from './SimplifiedError.js';
import { SimplifiedProgressAlertMessage } from './SimplifiedProgressAlertMessage.js';

export function SimplifiedInitialPost({
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
  if (data.status === 'error') {
    return <SimplifiedError data={data} message="We couldn't upload your document to Proofig." />;
  }
  const showPrepNote = shouldShowDocxPreparationCompleteNote(preparation, allStages);
  const refresh = (
    <ProofigProgressRefreshRow
      remoteStatusActionPath={remoteStatusActionPath}
      workVersionId={workVersionId}
      checkRunId={checkRunId}
    />
  );
  switch (data.status) {
    case 'pending':
      return (
        <div className="space-y-2">
          <ui.SimpleAlert
            type="info"
            message={<SimplifiedProgressAlertMessage text="Connecting…" />}
          />
          {refresh}
          {showPrepNote ? <DocxPreparationCompleteNote /> : null}
        </div>
      );
    case 'processing':
      return (
        <div className="space-y-2">
          <ui.SimpleAlert
            type="info"
            message={<SimplifiedProgressAlertMessage text="Uploading to Proofig…" />}
          />
          {refresh}
          {showPrepNote ? <DocxPreparationCompleteNote /> : null}
        </div>
      );
    case 'completed':
      return (
        <div className="space-y-2">
          <ui.SimpleAlert type="info" message="Upload complete." />
          {refresh}
          {showPrepNote ? <DocxPreparationCompleteNote /> : null}
        </div>
      );

    default:
      return (
        <div className="space-y-2">
          <ui.SimpleAlert type="info" message={<SimplifiedProgressAlertMessage text="Pending" />} />
          {refresh}
        </div>
      );
  }
}
