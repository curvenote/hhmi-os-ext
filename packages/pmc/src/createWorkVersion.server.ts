import {
  dbCreateDraftWorkVersion,
  getPrismaClient,
  type SecureContext,
} from '@curvenote/scms-server';
import { ActivityType } from '@curvenote/scms-db';
import { uuidv7 } from 'uuidv7';
import type { ExtensionCreateWorkVersionResult } from '@curvenote/scms-core';
import type { PMCWorkVersionMetadata } from './common/validate.js';
import { PMC_STATE_NAMES } from './workflows.js';

function seedPmcMetadataFromSource(
  sourceMetadata: Record<string, unknown>,
): Record<string, unknown> {
  const sourcePmc = (sourceMetadata.pmc ?? {}) as Record<string, unknown>;
  const { previewed, confirmed, ...restPmc } = sourcePmc as {
    previewed?: unknown;
    confirmed?: unknown;
  };
  void previewed;
  void confirmed;

  return {
    pmc: {
      ...restPmc,
      previewed: undefined,
      confirmed: undefined,
    },
  };
}

/**
 * Creates a new draft PMC work version on an existing work, plus a draft submission version.
 */
export async function createPMCWorkVersion(
  ctx: SecureContext,
  workId: string,
  sourceVersionMetadata: Record<string, unknown>,
  defaultTitle: string,
): Promise<ExtensionCreateWorkVersionResult> {
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

  const versionMetadata = seedPmcMetadataFromSource(sourceVersionMetadata);
  const { workVersionId } = await dbCreateDraftWorkVersion(
    ctx,
    workId,
    'work-details',
    defaultTitle,
    versionMetadata,
  );

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
        work_version: { connect: { id: workVersionId } },
        submission: { connect: { id: submission.id } },
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
        work_version: { connect: { id: workVersionId } },
        work: { connect: { id: workId } },
      },
      select: { id: true },
    });
  });

  return {
    success: true,
    workVersionId,
    redirectPath: `/app/works/${workId}/site/pmc/deposit/${submissionVersionId}`,
  };
}

export function isPMCWorkMetadata(
  metadata: Record<string, unknown>,
): metadata is PMCWorkVersionMetadata {
  return metadata.pmc != null && typeof metadata.pmc === 'object';
}
