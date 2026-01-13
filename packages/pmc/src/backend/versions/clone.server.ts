import type { WorkContext } from '@curvenote/scms-server';
import { getPrismaClient } from '@curvenote/scms-server';
import { uuidv7 } from 'uuidv7';
import { PMC_STATE_NAMES } from '../../workflows.js';
import type { SubmissionVersion, WorkVersion } from '@prisma/client';
import type {
  SubmissionVersionMetadataWithPMC,
  WorkVersionMetadataWithFilesAndPMC,
} from '../../common/metadata.schema.js';

/**
 * Gets a submission version from the database with related submission and work version data.
 * @param submissionVersionId - The submission version ID
 * @returns Submission version with related data or null if not found
 */
async function dbGetSubmissionVersion(submissionVersionId: string) {
  const prisma = await getPrismaClient();
  // Get the latest work version and submission version to clone from
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

/**
 * Creates new work version and submission version with copied metadata from a reference version.
 * @param referenceSubmissionVersion - The submission version to clone from
 * @param userId - The user ID creating the new version
 * @returns Object containing the new work version, submission version, and CDN key
 */
async function createNewVersions(
  referenceSubmissionVersion: NonNullable<Awaited<ReturnType<typeof dbGetSubmissionVersion>>>,
  userId: string,
): Promise<{
  newWorkVersion: WorkVersion;
  newSubmissionVersion: SubmissionVersion;
  newCdnKey: string;
}> {
  const prisma = await getPrismaClient();

  const refWV = referenceSubmissionVersion.work_version;
  const refWVMetadata = referenceSubmissionVersion.work_version
    .metadata as WorkVersionMetadataWithFilesAndPMC;

  const newWVMetadata = {
    ...refWVMetadata,
    pmc: {
      ...refWVMetadata?.pmc,
      previewed: false,
      confirmed: false,
    },
  } as WorkVersionMetadataWithFilesAndPMC;
  // TODO: get any advisory messagefrom emailProcessing in submissionVersion.metadata
  const newSVMetadata: SubmissionVersionMetadataWithPMC = { pmc: {} };

  // Generate new CDN key for the cloned version
  const newCdnKey = uuidv7();
  const timestamp = new Date().toISOString();

  // Execute all database operations in a transaction
  const { newWorkVersion, newSubmissionVersion } = await prisma.$transaction<{
    newWorkVersion: WorkVersion;
    newSubmissionVersion: SubmissionVersion;
  }>(async (tx) => {
    // Create new work version with copied metadata
    const nwv = await tx.workVersion.create({
      data: {
        id: uuidv7(),
        work_id: refWV.work_id,
        title: refWV.title,
        description: refWV.description,
        authors: refWV.authors,
        author_details: refWV.author_details.filter((a) => a !== null),
        date: refWV.date,
        doi: refWV.doi,
        canonical: refWV.canonical,
        metadata: newWVMetadata,
        cdn: refWV.cdn,
        cdn_key: newCdnKey,
        draft: true, // Start as draft
        date_created: timestamp,
        date_modified: timestamp,
      },
    });

    // Create new submission version with copied metadata
    const nsv = await tx.submissionVersion.create({
      data: {
        id: uuidv7(),
        submission_id: referenceSubmissionVersion.submission_id,
        work_version_id: nwv.id,
        status: PMC_STATE_NAMES.DRAFT,
        metadata: newSVMetadata,
        date_created: timestamp,
        date_modified: timestamp,
        date_published: referenceSubmissionVersion.date_published,
        submitted_by_id: userId,
      },
    });

    // Create activity records for audit trail
    await tx.activity.create({
      data: {
        id: uuidv7(),
        work_id: nwv.work_id,
        work_version_id: nwv.id,
        activity_type: 'WORK_VERSION_ADDED',
        status: 'New version created from cloning',
        date_created: timestamp,
        date_modified: timestamp,
        activity_by_id: userId,
      },
    });

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
    });

    return { newWorkVersion: nwv, newSubmissionVersion: nsv };
  });

  return {
    newWorkVersion,
    newSubmissionVersion,
    newCdnKey,
  };
}

/**
 * Clone a PMC work version and submission version with all metadata and files
 *
 * This function:
 * 1. Immediately creates new work version and submission version (draft status)
 * 2. Sets submission version status to INCOMPLETE with associated job
 * 3. Creates a background job for file copying operations
 * 4. Returns the new work version ID and job ID for progress tracking
 *
 * @param ctx - Work context containing user and work information
 * @param workId - ID of the work to clone
 * @param submissionVersionId - ID of the submission version to clone from
 * @returns Object containing new work version ID and job ID
 */
export async function clonePMCVersion(
  ctx: WorkContext,
  submissionVersionId: string,
): Promise<{ newWorkVersionId: string; newSubmissionVersionId: string }> {
  const prisma = await getPrismaClient();

  // Validate that the user has access to this work
  if (!ctx.user) {
    throw new Error('User must be authenticated to clone versions');
  }

  // Get the previous submission version to clone from
  const submissionVersion = await dbGetSubmissionVersion(submissionVersionId);

  if (!submissionVersion) {
    throw new Error(`Submission version ${submissionVersionId} not found`);
  }

  // Check if there's already a draft version being prepared
  const existingIncompleteVersion = await prisma.submissionVersion.findFirst({
    where: {
      submission: {
        id: submissionVersion?.submission_id,
      },
      status: PMC_STATE_NAMES.DRAFT,
    },
  });

  if (existingIncompleteVersion) {
    // Redirect to the clone progress page
    throw new Error(
      'A version is already being cloned for this work. Please wait for the current operation to complete.',
    );
  }

  // Step 1: Immediately create new work version and submission version
  const { newWorkVersion, newSubmissionVersion } = await createNewVersions(
    submissionVersion,
    ctx.user.id,
  );

  return {
    newWorkVersionId: newWorkVersion.id,
    newSubmissionVersionId: newSubmissionVersion.id,
  };
}

/**
 * Check if a work already has a draft version
 *
 * @param workId - ID of the work to check
 * @returns true if a draft version exists, false otherwise
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
 *
 * @param workId - ID of the work to get the draft version for
 * @returns The latest draft work version and submission version, or null if none exists
 */
export async function getLatestDraftVersion(workId: string) {
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
