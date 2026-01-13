import type { JobRegistration, ServerExtension } from '@curvenote/scms-core';
import { registerRoutes } from './routes.js';
import { extension as clientExtension } from './client.js';
import { PMC_DEPOSIT_FTP, pmcDepositHandler } from './backend/jobs/pmc-deposit.js';
import { PMC_WORKFLOW_SYNC, pmcWorkflowSyncHandler } from './backend/jobs/pmc-workflow-sync.js';
import { HHMI_GRANTS_SYNC, hhmiGrantsSyncHandler } from './backend/jobs/hhmi-grants-sync.js';

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
};
