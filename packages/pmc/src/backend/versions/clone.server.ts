import type { WorkContext } from '@curvenote/scms-server';
import { cloneDraftWorkVersionFromSource, getPrismaClient } from '@curvenote/scms-server';
import { uuidv7 } from 'uuidv7';
import type { SubmissionVersion, WorkVersion } from '@curvenote/scms-db';
import { PMC_STATE_NAMES } from '../../workflows.js';
import type { SubmissionVersionMetadataWithPMC } from '../../common/metadata.schema.js';

/**
 * Gets a submission version from the database with related submission and work version data.
 */
async function dbGetSubmissionVersion(submissionVersionId: string) {
  const prisma = await getPrismaClient();
  return prisma.submissionVersion.findUnique({
    where: { id: submissionVersionId },
    include: {
      submission: {
        include: {
          site: true,
        },
      },
      work_version: {
        include: {
          work: true,
        },
      },
    },
  });
}

async function createSubmissionVersionForClonedWork(
  referenceSubmissionVersion: NonNullable<Awaited<ReturnType<typeof dbGetSubmissionVersion>>>,
  newWorkVersionId: string,
  userId: string,
): Promise<SubmissionVersion> {
  const prisma = await getPrismaClient();
  const newSVMetadata: SubmissionVersionMetadataWithPMC = { pmc: {} };
  const timestamp = new Date().toISOString();

  return prisma.$transaction(async (tx) => {
    const nsv = await tx.submissionVersion.create({
      data: {
        id: uuidv7(),
        submission_id: referenceSubmissionVersion.submission_id,
        work_version_id: newWorkVersionId,
        status: PMC_STATE_NAMES.DRAFT,
        metadata: newSVMetadata,
        date_created: timestamp,
        date_modified: timestamp,
        date_published: referenceSubmissionVersion.date_published,
        submitted_by_id: userId,
      },
    });

    // WORK_VERSION_ADDED is recorded by cloneDraftWorkVersionFromSource (activityType param).
    await tx.activity.create({
      data: {
        id: uuidv7(),
        submission_id: nsv.submission_id,
        submission_version_id: nsv.id,
        activity_type: 'SUBMISSION_VERSION_ADDED',
        status: PMC_STATE_NAMES.DRAFT,
        date_created: timestamp,
        date_modified: timestamp,
        activity_by_id: userId,
      },
      select: { id: true },
    });

    return nsv;
  });
}

/**
 * Clone a PMC work version and submission version with all metadata and files.
 */
export async function clonePMCVersion(
  ctx: WorkContext,
  submissionVersionId: string,
): Promise<{ newWorkVersionId: string; newSubmissionVersionId: string }> {
  const prisma = await getPrismaClient();

  if (!ctx.user) {
    throw new Error('User must be authenticated to clone versions');
  }

  const submissionVersion = await dbGetSubmissionVersion(submissionVersionId);

  if (!submissionVersion) {
    throw new Error(`Submission version ${submissionVersionId} not found`);
  }

  const existingIncompleteVersion = await prisma.submissionVersion.findFirst({
    where: {
      submission: {
        id: submissionVersion.submission_id,
      },
      status: PMC_STATE_NAMES.DRAFT,
    },
  });

  if (existingIncompleteVersion) {
    throw new Error(
      'A version is already being cloned for this work. Please wait for the current operation to complete.',
    );
  }

  const sourceWorkVersionId = submissionVersion.work_version_id;
  const workId = submissionVersion.work_version.work_id;

  const { workVersionId: newWorkVersionId } = await cloneDraftWorkVersionFromSource(ctx, {
    workId,
    sourceWorkVersionId,
    source: 'pmc-submission-clone',
    activityType: 'WORK_VERSION_ADDED',
  });

  try {
    const newSubmissionVersion = await createSubmissionVersionForClonedWork(
      submissionVersion,
      newWorkVersionId,
      ctx.user.id,
    );

    return {
      newWorkVersionId,
      newSubmissionVersionId: newSubmissionVersion.id,
    };
  } catch (error) {
    await prisma.workVersion
      .deleteMany({ where: { id: newWorkVersionId, draft: true } })
      .catch(() => undefined);
    throw error;
  }
}

/**
 * Check if a work already has a draft version
 */
export async function hasDraftVersion(workId: string): Promise<boolean> {
  const prisma = await getPrismaClient();

  const draftVersion = await prisma.workVersion.findFirst({
    where: {
      work_id: workId,
      draft: true,
    },
    include: {
      submissionVersions: {
        where: {
          status: PMC_STATE_NAMES.DRAFT,
        },
        take: 1,
      },
    },
  });

  return draftVersion !== null && draftVersion.submissionVersions.length > 0;
}

/**
 * Get the latest draft version for a work
 */
export async function getLatestDraftVersion(workId: string): Promise<{
  workVersion: WorkVersion;
  submissionVersion: SubmissionVersion;
} | null> {
  const prisma = await getPrismaClient();

  const draftVersion = await prisma.workVersion.findFirst({
    where: {
      work_id: workId,
      draft: true,
    },
    include: {
      submissionVersions: {
        where: {
          status: PMC_STATE_NAMES.DRAFT,
        },
        orderBy: { date_created: 'desc' },
        take: 1,
      },
    },
    orderBy: { date_created: 'desc' },
  });

  if (!draftVersion || draftVersion.submissionVersions.length === 0) {
    return null;
  }

  return {
    workVersion: draftVersion,
    submissionVersion: draftVersion.submissionVersions[0],
  };
}
