import {
  cloneDraftWorkVersionFromSource,
  getPrismaClient,
  type SecureContext,
} from '@curvenote/scms-server';
import { ActivityType } from '@curvenote/scms-db';
import { uuidv7 } from 'uuidv7';
import type { ExtensionCreateWorkVersionResult } from '@curvenote/scms-core';
import type { PMCWorkVersionMetadata } from './common/validate.js';
import { PMC_STATE_NAMES } from './workflows.js';

/**
 * Creates a new draft PMC work version on an existing work, plus a draft submission version.
 */
export async function createPMCWorkVersion(
  ctx: SecureContext,
  workId: string,
  _sourceVersionMetadata: Record<string, unknown>,
  defaultTitle: string,
): Promise<ExtensionCreateWorkVersionResult> {
  void defaultTitle;
  const prisma = await getPrismaClient();
  const submission = await prisma.submission.findFirst({
    where: {
      work_id: workId,
      site: { name: 'pmc' },
    },
    select: { id: true },
  });

  if (!submission) {
    return {
      success: false,
      error: 'PMC submission not found for this work',
    };
  }

  const sourceVersion = await prisma.workVersion.findFirst({
    where: { work_id: workId, draft: false },
    orderBy: { date_created: 'desc' },
    select: { id: true },
  });

  if (!sourceVersion) {
    return {
      success: false,
      error: 'No finalized work version found to clone from',
    };
  }

  let workVersionId: string | undefined;

  try {
    ({ workVersionId } = await cloneDraftWorkVersionFromSource(ctx, {
      workId,
      sourceWorkVersionId: sourceVersion.id,
      source: 'work-details',
    }));
    const createdWorkVersionId = workVersionId;

    const date_created = new Date().toISOString();
    const submissionVersionId = uuidv7();

    await prisma.$transaction(async (tx) => {
      await tx.submissionVersion.create({
        data: {
          id: submissionVersionId,
          date_created,
          date_modified: date_created,
          status: PMC_STATE_NAMES.DRAFT,
          submitted_by: { connect: { id: ctx.user.id } },
          work_version: { connect: { id: createdWorkVersionId } },
          submission: { connect: { id: submission.id } },
          metadata: { pmc: {} },
        },
      });

      await tx.activity.create({
        data: {
          id: uuidv7(),
          date_created,
          date_modified: date_created,
          activity_by: { connect: { id: ctx.user.id } },
          activity_type: ActivityType.SUBMISSION_VERSION_ADDED,
          status: PMC_STATE_NAMES.DRAFT,
          submission: { connect: { id: submission.id } },
          submission_version: { connect: { id: submissionVersionId } },
          work_version: { connect: { id: createdWorkVersionId } },
          work: { connect: { id: workId } },
        },
        select: { id: true },
      });
    });

    return {
      success: true,
      workVersionId: createdWorkVersionId,
      redirectPath: `/app/works/${workId}/site/pmc/deposit/${submissionVersionId}`,
    };
  } catch (error) {
    if (workVersionId) {
      await prisma.workVersion
        .deleteMany({ where: { id: workVersionId, draft: true } })
        .catch(() => undefined);
    }
    console.error('Failed to create PMC work version:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create a new PMC deposit version.',
    };
  }
}

export function isPMCWorkMetadata(
  metadata: Record<string, unknown>,
): metadata is PMCWorkVersionMetadata {
  return metadata.pmc != null && typeof metadata.pmc === 'object';
}
