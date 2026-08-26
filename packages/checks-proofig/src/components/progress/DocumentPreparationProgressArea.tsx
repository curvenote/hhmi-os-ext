import { ui } from '@curvenote/scms-core';
import type { ProofigDataSchema, ProofigStage, ProofigStages } from '../../schema.js';
import { getStageProgressStep } from '../../schema.js';
import { DefaultArea } from './DefaultArea.js';
import { SimpleErrorArea } from './SimpleErrorArea.js';
import { StageProgressArea } from './StageProgressArea.js';

export function DocumentPreparationProgressArea({
  data,
  allStages,
  preparation,
}: {
  data: ProofigStage;
  allStages: ProofigStages;
  preparation?: ProofigDataSchema['preparation'];
}) {
  const { step, numSteps } = getStageProgressStep('documentPreparation', allStages, preparation);

  switch (data.status) {
    case 'pending':
    case 'processing':
      return (
        <div className="flex flex-col gap-6">
          <ui.SimpleAlert
            type="info"
            message={
              <div>
                <span className="font-bold">Preparing your document...</span> converting your Word
                file to PDF before upload to Proofig. This may take a minute for large manuscripts.
              </div>
            }
          />
          <StageProgressArea step={step} numSteps={numSteps} stageStartedAt={data.timestamp} />
        </div>
      );
    case 'error':
      return (
        <SimpleErrorArea
          step={step}
          numSteps={numSteps}
          message="We couldn't prepare your document for upload."
          data={data}
        />
      );
  }
  return <DefaultArea />;
}
