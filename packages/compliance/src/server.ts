import type { ServerExtension } from '@curvenote/scms-core';
import { obfuscateSecret } from '@curvenote/scms-core';
import { registerRoutes } from './routes.js';
import { extension as clientExtension } from './client.js';

function getSafeAdminConfig(config: Record<string, unknown>): Record<string, unknown> {
  const airtable = config.airtable as Record<string, unknown> | undefined;
  const hasWizardConfig =
    (typeof config.questions === 'object' && config.questions !== null) ||
    (typeof config.outcomes === 'object' && config.outcomes !== null);
  return {
    airtable: airtable ? { apiKey: obfuscateSecret(airtable.apiKey) } : undefined,
    enhancedArticleRendering: config.enhancedArticleRendering,
    wizardConfigured: hasWizardConfig,
  };
}

export const extension: ServerExtension = {
  ...clientExtension,
  registerRoutes,
  getSafeAdminConfig,
};
