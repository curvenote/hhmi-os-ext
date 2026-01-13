import {
  safelyPatchPMCMetadata,
  createPMCMetadataDescription,
  formatPMCAuthors,
} from './utils.server.js';
import { data } from 'react-router';
import { getPrismaClient } from '@curvenote/scms-server';
import type { PMCWorkVersionMetadataSection } from '../../common/metadata.schema.js';
import { hyphenatedFromDate } from '@curvenote/scms-core';
import type { WorkContext } from '@curvenote/scms-server';
import { PMCTrackEvent } from '../../analytics/events.js';

/**
 * Confirms a PMC deposit by updating metadata, work version, and submission version status.
 * Sets the work version to non-draft and submission version to PENDING.
 * @param ctx - Work context
 * @param workVersionId - The work version ID to confirm
 * @returns Success response or error response
 */
export async function confirmPMC(ctx: WorkContext, workVersionId: string) {
  const prisma = await getPrismaClient();

  // First, safely patch the PMC metadata to set confirmed
  await safelyPatchPMCMetadata(workVersionId, { confirmed: true });

  // Get the work version with its metadata
  const workVersion = await prisma.workVersion.findUnique({
    where: { id: workVersionId },
  });

  if (!workVersion) {
    return data({ error: { type: 'general', message: 'Work version not found' } }, { status: 500 });
  }

  const metadata = workVersion.metadata as PMCWorkVersionMetadataSection;
  const pmc = metadata.pmc;

  if (!pmc) {
    return data({ error: { type: 'general', message: 'PMC metadata not found' } }, { status: 500 });
  }

  // Create description and format authors using the extracted functions
  const description = createPMCMetadataDescription(pmc);
  const authors = formatPMCAuthors(pmc);
  const currentDate = hyphenatedFromDate(new Date());

  await prisma.$transaction(async (tx) => {
    // Update the work version with metadata
    await tx.workVersion.update({
      where: { id: workVersionId },
      data: {
        draft: false,
        title: pmc.title,
        description,
        authors,
        date: pmc.doiPublishedDate,
        doi: pmc.doiUrl,
        date_modified: new Date().toISOString(),
      },
    });

    // First check how many submission versions exist
    const count = await tx.submissionVersion.count({
      where: {
        work_version_id: workVersionId,
        submission: {
          site: {
            name: 'pmc',
          },
        },
      },
    });

    if (count === 0) {
      return data(
        { error: { type: 'general', message: 'No PMC submission version found for work version' } },
        { status: 500 },
      );
    }

    if (count > 1) {
      console.warn(
        `Multiple PMC submission versions found for work version ${workVersionId}. This should not happen.`,
      );
      return data(
        {
          error: {
            type: 'general',
            message: 'Multiple PMC submission versions found. Please contact support.',
          },
        },
        { status: 500 },
      );
    }

    // Get the submission version to update both it and its parent submission
    const submissionVersion = await tx.submissionVersion.findFirst({
      where: {
        work_version_id: workVersionId,
        submission: {
          site: {
            name: 'pmc',
          },
        },
      },
      select: {
        id: true,
        submission_id: true,
      },
    });

    if (!submissionVersion) {
      return data(
        { error: { type: 'general', message: 'Failed to find PMC submission version' } },
        { status: 500 },
      );
    }

    // Update the submission version
    await tx.submissionVersion.update({
      where: { id: submissionVersion.id },
      data: {
        status: 'PENDING',
        date_published: currentDate,
        date_modified: new Date().toISOString(),
      },
    });

    // Update the parent submission
    await tx.submission.update({
      where: { id: submissionVersion.submission_id },
      data: {
        date_published: currentDate,
        date_modified: new Date().toISOString(),
      },
    });
  });

  await ctx.trackEvent(PMCTrackEvent.PMC_DEPOSIT_CONFIRMED, {
    workVersionId: workVersionId,
    title: pmc.title,
    journalName: pmc.journalName,
    doiUrl: pmc.doiUrl,
    grants: pmc.grants,
    hasReviewer: !!pmc.reviewerEmail,
    hasCertification: !!pmc.certifyManuscript,
  });

  await ctx.analytics.flush();

  return { success: true };
}
