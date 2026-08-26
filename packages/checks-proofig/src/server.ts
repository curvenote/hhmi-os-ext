import type {
  Context,
  ServerExtension,
  ExtensionCheckService,
  JobRegistration,
  ScopeTree,
} from '@curvenote/scms-core';
import { getPrismaClient } from '@curvenote/scms-server';
import { extension as clientExtension, PROOFIG_CHECKS_ACTION_PATH } from './client.js';
import { ext } from './scopes.js';
import { handleProofigAction, proofigStatus } from './server/actions.js';
import { getProofigConfigWithOverrides } from './server/config.server.js';
import {
  PROOFIG_SUBMIT_STREAM,
  proofigSubmitStreamHandler,
} from './server/jobs/proofig-submit-stream.server.js';
import {
  PROOFIG_CONVERTER_FAILURE_CLEANUP,
  proofigConverterFailureCleanupHandler,
} from './server/jobs/proofig-converter-failure-cleanup.server.js';
import {
  PROOFIG_PERSIST_PDF,
  proofigPersistPdfHandler,
} from './server/jobs/proofig-persist-pdf.server.js';
import { proofigPersistPdfFailureCleanupHandler } from './server/jobs/proofig-persist-pdf-failure-cleanup.server.js';
import { PROOFIG_PERSIST_PDF_FAILURE_CLEANUP } from './server/jobs/proofigPersistPdf.constants.js';
import { ImageIntegrityChecksSection } from './components/ImageIntegrityChecksSection.js';
import { ProofigUploadCheckOption } from './components/ProofigUploadCheckOption.js';
import { isProofigUploadEligible, resolveProofigUploadEligibility } from './uploadEligibility.js';
import { registerRoutes } from './routes.js';
import { ImageIntegritySectionHeader } from './components/ImageIntegritySectionHeader.js';
import { getExtensionAdminActionHandlers } from './admin/actionHandlers.server.js';

export { PROOFIG_SUBMIT_STREAM };
export { PROOFIG_PERSIST_PDF };
export { getProofigConfigWithOverrides } from './server/config.server.js';

function getSafeAdminConfig(config: Record<string, unknown>): Record<string, unknown> {
  return {
    apiBaseUrl: config.apiBaseUrl,
    notifyBaseUrl: config.notifyBaseUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret ? '****************' : undefined,
    maintenance: config.maintenance,
    // clientSecret is never exposed to the client
  };
}

function getScopes(): ScopeTree {
  return { ext };
}

async function getExtensionConfiguration(
  ctx: Context,
): Promise<Record<string, unknown> | undefined> {
  const base = ctx.$config?.app?.extensions?.['checks-proofig'] as
    | Record<string, unknown>
    | undefined;

  const prisma = await getPrismaClient();
  return getProofigConfigWithOverrides(base ?? {}, prisma);
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
        id: 'proofig',
        name: 'Image Integrity',
        description: 'Detect potential issues with images in your work.',
        checksActionPath: PROOFIG_CHECKS_ACTION_PATH,
        sectionHeaderComponent: ImageIntegritySectionHeader,
        sectionActivityComponent: ImageIntegrityChecksSection,
        handleAction: handleProofigAction,
        handleStatus: proofigStatus,
        uploadCheckOptionComponent: ProofigUploadCheckOption,
        resolveUploadEligibility: resolveProofigUploadEligibility,
        isUploadEligible: isProofigUploadEligible,
      },
    ];
  },
  getJobs: (): JobRegistration[] => [
    {
      jobType: PROOFIG_SUBMIT_STREAM,
      handler: proofigSubmitStreamHandler as JobRegistration['handler'],
    },
    {
      jobType: PROOFIG_CONVERTER_FAILURE_CLEANUP,
      handler: proofigConverterFailureCleanupHandler as JobRegistration['handler'],
    },
    {
      jobType: PROOFIG_PERSIST_PDF,
      handler: proofigPersistPdfHandler as JobRegistration['handler'],
    },
    {
      jobType: PROOFIG_PERSIST_PDF_FAILURE_CLEANUP,
      handler: proofigPersistPdfFailureCleanupHandler as JobRegistration['handler'],
    },
  ],
  registerRoutes,
};
