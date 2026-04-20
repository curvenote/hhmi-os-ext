import type { ScopeTree, ServerExtension } from '@curvenote/scms-core';
import { registerRoutes } from './routes.js';
import { extension as clientExtension } from './client.js';
import { hhmi } from './backend/scopes.js';

function getScopes(): ScopeTree {
  return { hhmi };
}

function getSafeAdminConfig(config: Record<string, unknown>): Record<string, unknown> {
  const airtable = config.airtable as Record<string, unknown> | undefined;
  return {
    task: config.task,
    routes: config.routes,
    dataModels: config.dataModels,
    workflows: config.workflows,
    navigation: config.navigation,
    airtableApiKey: airtable?.apiKey != null ? '*****************' : undefined,
    enhancedArticleRendering: config.enhancedArticleRendering,
  };
}

export const extension: ServerExtension = {
  ...clientExtension,
  registerRoutes,
  getSafeAdminConfig,
  getScopes,
};
