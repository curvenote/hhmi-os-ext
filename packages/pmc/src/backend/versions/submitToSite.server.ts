import type { ExtensionSubmitToSiteArgs, ExtensionSubmitToSiteResult } from '@curvenote/scms-core';
import { coerceToObject } from '@curvenote/scms-core';
import type { WorkContext } from '@curvenote/scms-server';
import {
  getPrismaClient,
  makeDefaultWorkVersionMetadata,
  safeWorkVersionJsonUpdate,
} from '@curvenote/scms-server';
import { ActivityType } from '@curvenote/scms-db';
import { uuidv7 } from 'uuidv7';
import type { SubmissionVersionMetadataWithPMC } from '../../common/metadata.schema.js';
import { mergeFileMappings } from '../../common/fileMappings.js';
import { PMC_STATE_NAMES } from '../../workflows.js';
import { syncManuscriptFileMappings } from '../fileMappings.server.js';

function depositRedirectPath(workId: string, submissionVersionId: string) {
  return `/app/works/${workId}/site/pmc/deposit/${submissionVersionId}`;
}

async function seedPmcIntakeMetadataOnWorkVersion(
  workVersionId: string,
  user: { display_name?: string | null; email?: string | null },
) {
  const firstName = user.display_name?.split(' ')[0] ?? '';
  const lastName = user.display_name?.split(' ').slice(1).join(' ') ?? firstName;
  const email = user.email ?? '';

  await safeWorkVersionJsonUpdate(workVersionId, (metadata) => {
    const readMetadata = coerceToObject(metadata);
    const updated = {
      ...makeDefaultWorkVersionMetadata(),
      ...readMetadata,
    };
    const existingPmc =
      typeof readMetadata.pmc === 'object' && readMetadata.pmc != null ? readMetadata.pmc : {};
    const files =
      typeof readMetadata.files === 'object' && readMetadata.files != null
        ? readMetadata.files
        : {};
    const fileMappings = mergeFileMappings(
      files,
      existingPmc.fileMappings,
      existingPmc.excludedManuscriptSourcePaths,
    );
    const existingPmcWithoutMappings = { ...existingPmc };
    delete existingPmcWithoutMappings.fileMappings;

    updated.pmc = {
      openAccess: undefined,
      ccLicense: undefined,
      grants: Array.isArray(existingPmc.grants)
        ? existingPmc.grants
        : [{ id: uuidv7(), funderKey: 'hhmi', grantId: '' }],
      ownerFirstName: existingPmc.ownerFirstName ?? firstName,
      ownerLastName: existingPmc.ownerLastName ?? lastName,
      ownerEmail: existingPmc.ownerEmail ?? email,
      designateReviewer: existingPmc.designateReviewer ?? false,
      ...existingPmcWithoutMappings,
      ...(Object.keys(fileMappings).length > 0 ? { fileMappings } : {}),
      previewed: false,
      confirmed: false,
    };
    return updated as any;
  });
}

async function createSubmissionVersionOnWorkVersion(
  ctx: WorkContext,
  submissionId: string,
  workVersionId: string,
  workId: string,
): Promise<{ id: string }> {
  const prisma = await getPrismaClient();
  const submissionVersionId = uuidv7();
  const date_created = new Date().toISOString();
  const newSVMetadata: SubmissionVersionMetadataWithPMC = { pmc: {} };

  await prisma.$transaction(async (tx) => {
    await tx.submissionVersion.create({
      data: {
        id: submissionVersionId,
        submission_id: submissionId,
        work_version_id: workVersionId,
        status: PMC_STATE_NAMES.DRAFT,
        metadata: newSVMetadata,
        date_created,
        date_modified: date_created,
        submitted_by_id: ctx.user!.id,
      },
    });

    await tx.activity.create({
      data: {
        id: uuidv7(),
        submission_id: submissionId,
        submission_version_id: submissionVersionId,
        activity_type: ActivityType.SUBMISSION_VERSION_ADDED,
        status: PMC_STATE_NAMES.DRAFT,
        date_created,
        date_modified: date_created,
        activity_by_id: ctx.user!.id,
        work_id: workId,
        work_version_id: workVersionId,
      },
      select: { id: true },
    });
  });

  return { id: submissionVersionId };
}

async function createPmcSubmissionForWork(
  ctx: WorkContext,
  siteId: string,
  workId: string,
  workVersionId: string,
): Promise<{ submissionVersionId: string }> {
  const prisma = await getPrismaClient();
  const date_created = new Date().toISOString();
  const submissionId = uuidv7();
  const submissionVersionId = uuidv7();
  const newSVMetadata: SubmissionVersionMetadataWithPMC = { pmc: {} };

  await prisma.$transaction(async (tx) => {
    const site = await tx.site.findUnique({
      where: { id: siteId },
      include: {
        submissionKinds: { where: { default: true }, take: 1 },
        collections: { where: { default: true }, take: 1 },
      },
    });
    if (!site?.submissionKinds[0] || !site.collections[0]) {
      throw new Error('PMC site is missing default kind or collection');
    }

    await tx.submission.create({
      data: {
        id: submissionId,
        date_created,
        date_modified: date_created,
        submitted_by_id: ctx.user!.id,
        kind_id: site.submissionKinds[0].id,
        site_id: site.id,
        collection_id: site.collections[0].id,
        work_id: workId,
        versions: {
          create: {
            id: submissionVersionId,
            date_created,
            date_modified: date_created,
            status: PMC_STATE_NAMES.DRAFT,
            metadata: newSVMetadata,
            submitted_by_id: ctx.user!.id,
            work_version_id: workVersionId,
          },
        },
      },
    });

    await tx.activity.create({
      data: {
        id: uuidv7(),
        date_created,
        date_modified: date_created,
        activity_by_id: ctx.user!.id,
        activity_type: ActivityType.NEW_SUBMISSION,
        submission_id: submissionId,
        submission_version_id: submissionVersionId,
        work_id: workId,
        work_version_id: workVersionId,
        kind_id: site.submissionKinds[0].id,
      },
      select: { id: true },
    });
  });

  return { submissionVersionId };
}

/**
 * Submit the current finalized work version to PMC without cloning a new work version.
 */
export async function submitWorkToPmcSite(
  args: ExtensionSubmitToSiteArgs,
): Promise<ExtensionSubmitToSiteResult> {
  const ctx = args.ctx as WorkContext;
  if (!ctx.user) {
    return { success: false, error: 'User must be authenticated to submit to PMC' };
  }

  const prisma = await getPrismaClient();

  const site = await prisma.site.findUnique({
    where: { name: args.siteName },
    select: { id: true },
  });
  if (!site) {
    return { success: false, error: 'Selected site does not exist' };
  }

  const workVersion = await prisma.workVersion.findFirst({
    where: { id: args.workVersionId, work_id: args.workId, draft: false },
    select: { id: true },
  });
  if (!workVersion) {
    return { success: false, error: 'No completed work version is available to submit' };
  }

  const existingDraft = await prisma.submissionVersion.findFirst({
    where: {
      submission: { work_id: args.workId, site_id: site.id },
      status: PMC_STATE_NAMES.DRAFT,
    },
    orderBy: { date_created: 'desc' },
    select: { id: true },
  });

  if (existingDraft) {
    await syncManuscriptFileMappings(args.workVersionId);
    return {
      success: true,
      submissionVersionId: existingDraft.id,
      redirectPath: depositRedirectPath(args.workId, existingDraft.id),
    };
  }

  const existingSubmission = await prisma.submission.findFirst({
    where: { work_id: args.workId, site_id: site.id },
    select: { id: true },
  });

  const submissionVersionId = existingSubmission
    ? (
        await createSubmissionVersionOnWorkVersion(
          ctx,
          existingSubmission.id,
          args.workVersionId,
          args.workId,
        )
      ).id
    : (await createPmcSubmissionForWork(ctx, site.id, args.workId, args.workVersionId))
        .submissionVersionId;

  await seedPmcIntakeMetadataOnWorkVersion(args.workVersionId, ctx.user);

  return {
    success: true,
    submissionVersionId,
    redirectPath: depositRedirectPath(args.workId, submissionVersionId),
  };
}
