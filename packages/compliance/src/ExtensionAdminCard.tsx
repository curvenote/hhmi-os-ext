import { ExtensionAdminCardContent, type ExtensionAdminCardProps } from '@curvenote/scms-core';

function ExtensionAdminCard({ name, extension, record, ExtensionIcon }: ExtensionAdminCardProps) {
  return (
    <ExtensionAdminCardContent
      name={name}
      capabilities={extension.capabilities}
      record={record}
      ExtensionIcon={ExtensionIcon}
    />
  );
}

export default ExtensionAdminCard;
