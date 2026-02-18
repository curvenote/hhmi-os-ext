import { ExtensionAdminCardContent, type ExtensionAdminCardProps } from '@curvenote/scms-core';

function ExtensionAdminCard({ name, extension, record, ExtensionIcon }: ExtensionAdminCardProps) {
  const depositService = record?.depositService as
    | { projectId?: string; topic?: string; secretKeyfile?: string }
    | undefined;
  const inboundEmail = record?.inboundEmail as
    | { enabled?: boolean; username?: string; senders?: string[] }
    | undefined;

  const recordFiltered = record ? { ...record } as Record<string, unknown> : undefined;
  if (recordFiltered) {
    delete recordFiltered.depositService;
    delete recordFiltered.inboundEmail;
  }

  return (
    <ExtensionAdminCardContent
      name={name}
      capabilities={extension.capabilities}
      record={recordFiltered && Object.keys(recordFiltered).length > 0 ? recordFiltered : undefined}
      ExtensionIcon={ExtensionIcon}
    >
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
                <dt className="inline ml-2 font-medium">Topic: </dt>
                <dd className="inline">{depositService.topic}</dd>
              </>
            )}
            {depositService.secretKeyfile !== undefined && depositService.secretKeyfile !== '' && (
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
                <dt className="block mt-1 font-medium">Senders: </dt>
                <dd className="text-muted-foreground">{inboundEmail.senders.length} allowed</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </ExtensionAdminCardContent>
  );
}

export default ExtensionAdminCard;
