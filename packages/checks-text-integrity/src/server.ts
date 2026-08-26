import type {
  Context,
  ServerExtension,
  ExtensionCheckService,
  JobRegistration,
  ScopeTree,
} from '@curvenote/scms-core';
import { getPrismaClient } from '@curvenote/scms-server';
import { extension as clientExtension, TEXT_INTEGRITY_CHECKS_ACTION_PATH } from './client.js';
import { ext } from './scopes.js';
import { handleTextIntegrityAction, textIntegrityStatus } from './server/actions.js';
import {
  buildStoredServiceConfigurationForAdmin,
  getTextIntegrityConfigWithOverrides,
} from './server/config.server.js';
import { TEXT_INTEGRITY_SUBMIT } from './server/jobs/text-integrity-submit.server.js';
import { TEXT_INTEGRITY_PERSIST_PDF } from './server/jobs/text-integrity-persist-pdf.server.js';
import { TEXT_INTEGRITY_JOB_REGISTRATIONS } from './server/text-integrity-jobs.server.js';
import { TextIntegrityChecksSection } from './components/TextIntegrityChecksSection.js';
import { TextIntegrityUploadCheckOption } from './components/TextIntegrityUploadCheckOption.js';
import { isTextIntegrityUploadEligible } from './uploadEligibility.js';
import { registerRoutes } from './routes.js';
import { TextIntegritySectionHeader } from './components/TextIntegritySectionHeader.js';
import { getExtensionAdminActionHandlers } from './admin/actionHandlers.server.js';
import {
  resolveTextIntegrityDesignManifest,
  resolveTextIntegrityUploadLogoUrl,
} from './server/manifest.server.js';

export { TEXT_INTEGRITY_SUBMIT, TEXT_INTEGRITY_PERSIST_PDF };
export { getTextIntegrityConfigWithOverrides } from './server/config.server.js';

function getSafeAdminConfig(config: Record<string, unknown>): Record<string, unknown> {
  return {
    serviceName: config.serviceName,
    relayInstanceId: config.relayInstanceId,
    storedServiceConfiguration: buildStoredServiceConfigurationForAdmin(config),
    maintenance: config.maintenance,
  };
}

function getScopes(): ScopeTree {
  return { ext };
}

async function getExtensionConfiguration(
  ctx: Context,
): Promise<Record<string, unknown> | undefined> {
  const base = ctx.$config?.app?.extensions?.['checks-text-integrity'] as
    | Record<string, unknown>
    | undefined;

  const prisma = await getPrismaClient();
  return getTextIntegrityConfigWithOverrides(base ?? {}, prisma);
}

export const extension: ServerExtension = {
  ...clientExtension,
  getExtensionConfiguration,
  getSafeAdminConfig,
  getExtensionAdminActionHandlers,
  getScopes,
  getChecks: (): ExtensionCheckService[] => {
    return [
      {
        id: 'checks-text-integrity',
        name: 'Text Integrity',
        description: 'Verify text integrity in your work.',
        checksActionPath: TEXT_INTEGRITY_CHECKS_ACTION_PATH,
        sectionHeaderComponent: TextIntegritySectionHeader,
        sectionActivityComponent: TextIntegrityChecksSection,
        handleAction: handleTextIntegrityAction,
        handleStatus: textIntegrityStatus,
        uploadCheckOptionComponent: TextIntegrityUploadCheckOption,
        isUploadEligible: isTextIntegrityUploadEligible,
        resolveUploadLogoUrl: resolveTextIntegrityUploadLogoUrl,
      },
    ];
  },
  getDesignLoaderData: async (ctx) => ({
    designManifest: await resolveTextIntegrityDesignManifest(ctx),
  }),
  getJobs: (): JobRegistration[] => TEXT_INTEGRITY_JOB_REGISTRATIONS,
  registerRoutes,
};
