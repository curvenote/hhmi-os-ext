import type { ProofigStage } from '../schema.js';
import { ui } from '@curvenote/scms-core';

export function SimplifiedError({
  data,
  message = 'Something went wrong.',
}: {
  data: ProofigStage;
  message?: string;
}) {
  const systemError = data?.error?.trim();
  return (
    <ui.SimpleAlert
      type="error"
      message={
        <div>
          <span className="font-bold">{message}</span>
          {systemError ? <> ({systemError})</> : null}
        </div>
      }
    />
  );
}
