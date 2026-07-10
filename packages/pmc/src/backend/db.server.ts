import { getPrismaClient, dbCreateDraftWork } from '@curvenote/scms-server';
import type { WorkContents } from '@curvenote/scms-core';
import { formatOwnerAsAuthor } from './metadata/utils.server.js';
import type { SecureContext, WorkContext } from '@curvenote/scms-server';
import { uuidv7 } from 'uuidv7';
import { PMCTrackEvent } from '../analytics/events.js';
import { PMC_STATE_NAMES } from '../workflows.js';

/**
 * Retrieves the PMC site from the database
 *
 * @returns The PMC site record or null if not found
 */
export async function dbGetPMCSite() {
  const prisma = await getPrismaClient();
  return prisma.site.findUnique({
    where: { name: 'pmc' },
  });
}

/**
 * Creates a new draft PMC work
 *
 *
 * @param ctx - The secure context
 * @param title - The title of the work
 * @param description - The description of the work
 * @param contains - The contents of the work
 * @returns The new work record
 */
export async function dbCreateDraftPMCWork(
  ctx: SecureContext,
  title: string,
  description: string,
  contains: WorkContents[],
) {
  const firstName = ctx.user.display_name?.split(' ')[0] ?? '';
  const lastName = ctx.user.display_name?.split(' ').slice(1).join(' ') ?? firstName;
  const email = ctx.user.email;
  const authors = [formatOwnerAsAuthor({ firstName, lastName })];

  const newWork = await dbCreateDraftWork(ctx, title, description, authors, contains, {
    pmc: {
      openAccess: undefined,
      ccLicense: undefined,
      grants: [
        {
          id: uuidv7(),
          funderKey: 'hhmi',
          grantId: '',
        },
      ],
      ownerFirstName: firstName,
      ownerLastName: lastName,
      ownerEmail: email,
      designateReviewer: false,
    },
  });

  await ctx.trackEvent(PMCTrackEvent.PMC_DEPOSIT_CREATED, {
    workId: newWork.id,
    workVersionId: newWork.versions[0].id,
    title,
    description,
    authorCount: authors.length,
    contains: newWork.contains,
  });

  await ctx.analytics.flush();

  return newWork;
}

/**
 * Retrieves the latest work version for a given work ID
 *
 * @param ctx - The work context containing user and work information
 * @param workId - The ID of the work to get the version for
 * @returns The latest work version record or null if not found
 */
export async function dbGetWorkVersion(ctx: WorkContext, workId: string) {
  const prisma = await getPrismaClient();
  const versionDbo = await prisma.workVersion.findFirst({
    where: { work: { id: workId } },
    orderBy: { date_created: 'desc' },
  });

  return versionDbo;
}

/**
 * Retrieves a submission version from the database
 *
 * @param submissionVersionId - The ID of the submission version to get
 * @returns The submission version record or null if not found
 */
export async function dbGetSubmissionVersion(submissionVersionId: string) {
  const prisma = await getPrismaClient();
  return prisma.submissionVersion.findFirst({
    where: { id: submissionVersionId },
    include: {
      work_version: {
        include: {
          work: true,
        },
      },
      submission: {
        include: {
          collection: true,
        },
      },
      job: true,
    },
  });
}

/**
 * Retrieves the number of submission versions for a given submission
 *
 * @param submissionId - The ID of the submission to get the number of submission versions for
 * @returns The number of submission versions
 */
export async function dbGetNumSubmissionVersions(submissionId: string) {
  const prisma = await getPrismaClient();
  return prisma.submissionVersion.count({ where: { submission_id: submissionId } });
}

/**
 * Latest non-draft submission version for breadcrumb navigation back to the deposit status page.
 */
export async function dbGetLatestNonDraftSubmissionVersionId(
  submissionId: string,
  excludeSubmissionVersionId?: string,
) {
  const prisma = await getPrismaClient();
  const version = await prisma.submissionVersion.findFirst({
    where: {
      submission_id: submissionId,
      status: { not: PMC_STATE_NAMES.DRAFT },
      ...(excludeSubmissionVersionId ? { id: { not: excludeSubmissionVersionId } } : {}),
    },
    orderBy: { date_created: 'desc' },
    select: { id: true },
  });
  return version?.id ?? null;
}

export async function dbGetSubmissionVersions(ctx: WorkContext) {
  const prisma = await getPrismaClient();
  // Get all submission versions for this work and PMC site
  return prisma.submissionVersion.findMany({
    where: {
      work_version: {
        work_id: ctx.work.id,
      },
      submission: {
        site: {
          name: 'pmc',
        },
      },
    },
    include: {
      work_version: true,
      submission: {
        include: {
          collection: true,
          site: true,
        },
      },
    },
    orderBy: { date_created: 'desc' },
  });
}

/**
 * Type definition for draft PMC deposit
 */
export interface DraftPMCDeposit {
  workId: string;
  workVersionId: string;
  workTitle: string;
  submissionVersionId: string;
  dateModified: string;
  dateCreated: string;
  metadata: any;
  completionStatus: {
    completed: number;
    total: number;
  };
  versionNumber: number;
}

/**
 * Calculate completion status for PMC work version metadata
 */
function calculateCompletionStatus(metadata: any): { completed: number; total: number } {
  const pmcData = metadata?.pmc || {};

  const checks = [
    // Grant Information: pmc.grants[].grantId (user must fill)
    !!(pmcData.grants && pmcData.grants.some((g: any) => g.grantId?.trim())),
    // File Upload: files (user must upload)
    !!(metadata.files && Object.keys(metadata.files).length > 0),
    // Publication Title: pmc.title (user must fill)
    !!pmcData.title?.trim(),
    // Journal Name: pmc.journalName (user must fill)
    !!pmcData.journalName?.trim(),
    // Open Access Decision: pmc.openAccess (user must decide)
    pmcData.openAccess !== undefined,
    // License Selection: pmc.ccLicense (required if open access)
    !pmcData.openAccess || !!pmcData.ccLicense,
  ];

  return {
    completed: checks.filter(Boolean).length,
    total: checks.length,
  };
}

/**
 * Get user's draft PMC deposits
 *
 * @param userId - The user ID to get drafts for
 * @returns Array of draft PMC deposits
 */
export async function dbGetUserDraftPMCDeposits(userId: string): Promise<DraftPMCDeposit[]> {
  const prisma = await getPrismaClient();

  // Query for works that meet the expected state criteria:
  // - User has access to the work
  // - Work has at least 1 submission to the PMC site
  // - Each submission has at least 1 submission version with status: 'DRAFT'
  // - Each submission version exactly 1 WorkVersion with draft: true
  const works = await prisma.work.findMany({
    where: {
      work_users: {
        some: {
          user_id: userId,
          role: 'OWNER',
        },
      },
      submissions: {
        some: {
          site: {
            name: 'pmc',
          },
          versions: {
            some: {
              status: 'DRAFT',
            },
          },
        },
      },
    },
    include: {
      submissions: {
        where: {
          site: {
            name: 'pmc',
          },
        },
        include: {
          versions: {
            orderBy: {
              date_created: 'asc',
            },
            include: {
              work_version: {
                select: {
                  id: true,
                  draft: true,
                  title: true,
                  date_modified: true,
                  date_created: true,
                  metadata: true,
                  work_id: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      date_modified: 'desc',
    },
  });

  // Transform to a list of submissions and filter to only include works that meet expected state:
  // - Has at least one submission version with status: 'DRAFT' and is associated with exactly 1 draft WorkVersion (1-to-1 relationship)
  const validSubmissions = works
    .flatMap((work) => work.submissions)
    .filter((submission) => {
      return submission.versions.some(
        (version) => version.status === 'DRAFT' && version.work_version.draft === true,
      );
    });

  // Transform to DraftPMCDeposit format
  return validSubmissions.map((submission) => {
    // Find the draft version
    const draftVersionIndex = submission.versions.findIndex(
      (version) => version.status === 'DRAFT' && version.work_version.draft === true,
    );
    const draftSubmissionVersion = submission.versions[draftVersionIndex];
    const workVersion = draftSubmissionVersion.work_version;

    // Version number is the position in chronological order (1-based)
    const versionNumber = draftVersionIndex + 1;

    return {
      workId: workVersion.work_id,
      workVersionId: workVersion.id,
      workTitle: workVersion.title || 'New PMC Deposit',
      submissionVersionId: draftSubmissionVersion.id,
      dateModified: workVersion.date_modified,
      dateCreated: workVersion.date_created,
      metadata: workVersion.metadata,
      completionStatus: calculateCompletionStatus(workVersion.metadata),
      versionNumber,
    };
  });
}
