import type { ComponentProps } from 'react';
import { ProofigRefreshRemoteStatusButton } from './ProofigRefreshRemoteStatusButton.js';

export function ProofigProgressRefreshRow({
  remoteStatusActionPath,
  workVersionId,
  checkRunId,
  buttonSize,
}: {
  remoteStatusActionPath?: string;
  workVersionId?: string;
  checkRunId?: string;
  buttonSize?: ComponentProps<typeof ProofigRefreshRemoteStatusButton>['buttonSize'];
}) {
  if (!remoteStatusActionPath || !workVersionId) return null;
  return (
    <div className="flex flex-wrap gap-2 justify-end items-center">
      <ProofigRefreshRemoteStatusButton
        actionPath={remoteStatusActionPath}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        buttonSize={buttonSize}
      />
    </div>
  );
}
