import { ui } from '@curvenote/scms-core';
import type { ProofigStage } from '../../schema.js';
import { StageProgressArea } from './StageProgressArea.js';

export function SimpleErrorArea({
  step,
  numSteps,
  message,
  data,
}: {
  step: number;
  numSteps: number;
  message: string;
  data: ProofigStage;
}) {
  const systemError = data.error?.trim();

  return (
    <div className="flex flex-col gap-6">
      <ui.SimpleAlert
        type="error"
        message={
          <div>
            <span className="font-bold">{message}</span>
            {systemError ? <> ({systemError})</> : null}
          </div>
        }
      />
      <StageProgressArea
        step={step}
        numSteps={numSteps}
        message={systemError ?? message ?? 'Failed at this stage.'}
        state="error"
      />
    </div>
  );
}
