import type { ExtensionAdminCardProps } from '@curvenote/scms-core';

function ExtensionAdminCard({ config, extensionName, ExtensionIcon }: ExtensionAdminCardProps) {
  const airtable = config.airtable as { apiKey?: string } | undefined;
  const enhancedArticleRendering = config.enhancedArticleRendering as boolean | undefined;
  const wizardConfigured = config.wizardConfigured as boolean | undefined;

  return (
    <div className="grid grid-cols-1 gap-4 min-w-0 md:grid-cols-2 md:items-start md:gap-2">
      <div className="flex gap-3 items-center min-w-0">
        {ExtensionIcon && <ExtensionIcon className="w-6 h-6 shrink-0" />}
        <h2 className="text-xl font-semibold capitalize">{extensionName}</h2>
      </div>
      <div className="space-y-4">
        {airtable && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Airtable</p>
            <p className="text-sm">
              {airtable.apiKey !== undefined && airtable.apiKey !== ''
                ? 'API key configured'
                : 'Not configured'}
            </p>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Enhanced article rendering</p>
          <p className="text-sm">{enhancedArticleRendering ? 'Enabled' : 'Disabled'}</p>
        </div>
        {wizardConfigured !== undefined && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Compliance wizard</p>
            <p className="text-sm">{wizardConfigured ? 'Configured' : 'Not configured'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExtensionAdminCard;
