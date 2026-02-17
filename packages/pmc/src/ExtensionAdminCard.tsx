import type { ExtensionAdminCardProps } from '@curvenote/scms-core';

function ExtensionAdminCard({ config, extensionName, ExtensionIcon }: ExtensionAdminCardProps) {
  const depositService = config.depositService as
    | { projectId?: string; topic?: string; secretKeyfile?: string }
    | undefined;
  const inboundEmail = config.inboundEmail as
    | { enabled?: boolean; username?: string; senders?: string[] }
    | undefined;

  return (
    <div className="grid grid-cols-1 gap-4 min-w-0 md:grid-cols-2 md:items-start md:gap-2">
      <div className="flex gap-3 items-center min-w-0">
        {ExtensionIcon && <ExtensionIcon className="w-6 h-6 shrink-0" />}
        <h2 className="text-xl font-semibold capitalize">{extensionName}</h2>
      </div>
      <div className="space-y-4">
        {depositService && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Deposit service (Pub/Sub)</p>
            <dl className="text-sm space-y-0.5">
              {depositService.projectId && (
                <>
                  <dt className="inline font-medium">Project: </dt>
                  <dd className="inline">{depositService.projectId}</dd>
                </>
              )}
              {depositService.topic && (
                <>
                  <dt className="inline font-medium ml-2">Topic: </dt>
                  <dd className="inline">{depositService.topic}</dd>
                </>
              )}
              {depositService.secretKeyfile !== undefined &&
                depositService.secretKeyfile !== '' && (
                  <dd className="text-muted-foreground">Credentials configured</dd>
                )}
            </dl>
          </div>
        )}
        {inboundEmail && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Inbound email</p>
            <dl className="text-sm space-y-0.5">
              <dt className="inline font-medium">Enabled: </dt>
              <dd className="inline">{inboundEmail.enabled ? 'Yes' : 'No'}</dd>
              {inboundEmail.username !== undefined && inboundEmail.username !== '' && (
                <dd className="text-muted-foreground">Username configured</dd>
              )}
              {Array.isArray(inboundEmail.senders) && inboundEmail.senders.length > 0 && (
                <>
                  <dt className="block font-medium mt-1">Senders: </dt>
                  <dd className="text-muted-foreground">{inboundEmail.senders.length} allowed</dd>
                </>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExtensionAdminCard;
