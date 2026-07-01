import type { JobRegistration, ServerExtension } from '@curvenote/scms-core';
import { obfuscateSecret } from '@curvenote/scms-core';
import type { SecureContext } from '@curvenote/scms-server';
import { registerRoutes } from './routes.js';
import { extension as clientExtension } from './client.js';
import { createPMCWorkVersion, isPMCWorkMetadata } from './createWorkVersion.server.js';
import { PMC_DEPOSIT_FTP, pmcDepositHandler } from './backend/jobs/pmc-deposit.js';
import { PMC_WORKFLOW_SYNC, pmcWorkflowSyncHandler } from './backend/jobs/pmc-workflow-sync.js';
import { HHMI_GRANTS_SYNC, hhmiGrantsSyncHandler } from './backend/jobs/hhmi-grants-sync.js';

function getSafeAdminConfig(config: Record<string, unknown>): Record<string, unknown> {
  const depositService = config.depositService as Record<string, unknown> | undefined;
  const inboundEmail = config.inboundEmail as Record<string, unknown> | undefined;
  return {
    depositService: depositService
      ? {
          projectId: depositService.projectId,
          topic: depositService.topic,
          secretKeyfile: obfuscateSecret(depositService.secretKeyfile),
        }
      : undefined,
    inboundEmail: inboundEmail
      ? {
          enabled: inboundEmail.enabled,
          username: obfuscateSecret(inboundEmail.username),
          password: obfuscateSecret(inboundEmail.password),
          senders: Array.isArray(inboundEmail.senders) ? inboundEmail.senders : undefined,
        }
      : undefined,
  };
}

/**
 * Returns job registrations for the PMC extension.
 * @returns Array of job registrations
 */
export function getJobs(): JobRegistration[] {
  return [
    {
      jobType: PMC_DEPOSIT_FTP,
      handler: pmcDepositHandler,
      requiresStorageBackend: true,
    },
    {
      jobType: PMC_WORKFLOW_SYNC,
      handler: pmcWorkflowSyncHandler,
      requiresStorageBackend: false,
    },
    {
      jobType: HHMI_GRANTS_SYNC,
      handler: hhmiGrantsSyncHandler,
      requiresStorageBackend: false,
    },
  ];
}

export const extension: ServerExtension = {
  ...clientExtension,
  getJobs,
  registerRoutes,
  getSafeAdminConfig,
  createWorkVersion: async ({ ctx, workId, sourceVersionMetadata, defaultTitle }) => {
    if (!isPMCWorkMetadata(sourceVersionMetadata)) return null;
    return createPMCWorkVersion(ctx as SecureContext, workId, sourceVersionMetadata, defaultTitle);
  },
};
