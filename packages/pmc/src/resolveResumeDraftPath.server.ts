import type { ExtensionResolveResumeDraftPathArgs } from '@curvenote/scms-core';
import { getPrismaClient } from '@curvenote/scms-server';
import { pmcDepositPath } from './pmcDepositLauncherState.js';
import { PMC_STATE_NAMES, PMC_WORKSPACE_SITE_NAME } from './workflows.js';

/**
 * Resume URL for a draft PMC create flow. Looks up the draft submission version
 * for the work version so the platform can deep-link into the deposit form.
 */
export async function resolveResumeDraftPath({
  workId,
  workVersionId,
}: ExtensionResolveResumeDraftPathArgs): Promise<string | null> {
  const prisma = await getPrismaClient();
  const draftSubmissionVersion = await prisma.submissionVersion.findFirst({
    where: {
      work_version_id: workVersionId,
      submission: { site: { name: PMC_WORKSPACE_SITE_NAME } },
      status: PMC_STATE_NAMES.DRAFT,
    },
    orderBy: { date_created: 'desc' },
    select: { id: true },
  });

  if (!draftSubmissionVersion) return null;
  return pmcDepositPath(workId, draftSubmissionVersion.id);
}
