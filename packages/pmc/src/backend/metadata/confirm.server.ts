import {
  safelyPatchPMCMetadata,
  createPMCMetadataDescription,
  formatPMCAuthors,
} from './utils.server.js';
import { getPrismaClient } from '@curvenote/scms-server';
import type { PMCWorkVersionMetadataSection } from '../../common/metadata.schema.js';
import { hyphenatedFromDate, KnownResendEvents } from '@curvenote/scms-core';
import type { WorkContext } from '@curvenote/scms-server';
import { PMCTrackEvent } from '../../analytics/events.js';

export type ConfirmPMCError = { type: string; message: string };
export type ConfirmPMCResult = { success: true; submissionId: string } | { error: ConfirmPMCError };

/**
 * Confirms a PMC deposit by updating metadata, work version, and submission version status.
 * Sets the work version to non-draft and submission version to PENDING.
 * @param ctx - Work context
 * @param workVersionId - The work version ID to confirm
 * @returns Plain result object: { success: true, submissionId } or { error: { type, message } }
 */
export async function confirmPMC(
  ctx: WorkContext,
  workVersionId: string,
): Promise<ConfirmPMCResult> {
  const prisma = await getPrismaClient();

  // First, safely patch the PMC metadata to set confirmed
  await safelyPatchPMCMetadata(workVersionId, { confirmed: true });

  // Get the work version with its metadata
  const workVersion = await prisma.workVersion.findUnique({
    where: { id: workVersionId },
  });

  if (!workVersion) {
    return { error: { type: 'general', message: 'Work version not found' } };
  }

  const metadata = workVersion.metadata as PMCWorkVersionMetadataSection;
  const pmc = metadata.pmc;

  if (!pmc) {
    return { error: { type: 'general', message: 'PMC metadata not found' } };
  }

  // Create description and format authors using the extracted functions
  const description = createPMCMetadataDescription(pmc);
  const authors = formatPMCAuthors(pmc);
  const currentDate = hyphenatedFromDate(new Date());

  const txResult = await prisma.$transaction<
    { ok: true; submissionId: string } | { error: ConfirmPMCError }
  >(async (tx) => {
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
      return {
        error: {
          type: 'general',
          message: 'No PMC submission version found for work version',
        },
      };
    }

    if (count > 1) {
      console.warn(
        `Multiple PMC submission versions found for work version ${workVersionId}. This should not happen.`,
      );
      return {
        error: {
          type: 'general',
          message: 'Multiple PMC submission versions found. Please contact support.',
        },
      };
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
      return { error: { type: 'general', message: 'Failed to find PMC submission version' } };
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

    return { ok: true, submissionId: submissionVersion.submission_id };
  });

  if ('error' in txResult) {
    return { error: txResult.error };
  }

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

  // Notify support when a new deposit transitions to PENDING
  const supportEmail = ctx.$config.app?.supportEmail;
  if (supportEmail) {
    try {
      const title = pmc.title ?? 'Untitled';
      const bodyLines = [
        'A new PMC deposit has been confirmed and is now PENDING (New Deposit Uploaded).',
        '',
        `Title: ${title}`,
        `Journal: ${pmc.journalName ?? '—'}`,
        `DOI: ${pmc.doiUrl ?? '—'}`,
        `Work version ID: ${workVersionId}`,
      ];
      await ctx.sendEmail({
        eventType: KnownResendEvents.GENERIC_NOTIFICATION,
        to: supportEmail,
        subject: 'PMC: New deposit marked PENDING',
        templateProps: {
          previewText: `New deposit confirmed: ${title}`,
          children: bodyLines.join('\n'),
        },
      });
    } catch (emailError) {
      console.error('Failed to send PENDING notification to support:', emailError);
    }
  }

  return { success: true, submissionId: txResult.submissionId };
}
