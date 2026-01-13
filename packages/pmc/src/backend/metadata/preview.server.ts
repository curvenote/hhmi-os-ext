import { safelyPatchPMCMetadata } from './utils.server.js';
import type { WorkContext } from '@curvenote/scms-server';
import type { PMCWorkVersionMetadata } from '../../common/validate.js';
import { PMCTrackEvent } from '../../analytics/events.js';

/**
 * Sets the preview flag for a PMC deposit and tracks analytics.
 * @param ctx - Work context
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function setPreviewDeposit(ctx: WorkContext, workVersionId: string) {
  const result = await safelyPatchPMCMetadata(workVersionId, {
    previewed: true,
  });

  const metadata = ctx.work.versions?.find((version) => version.id === workVersionId)?.metadata as
    | PMCWorkVersionMetadata
    | undefined;
  const pmc = metadata?.pmc;

  await ctx.trackEvent(PMCTrackEvent.PMC_DEPOSIT_PREVIEWED, {
    workVersionId,
    title: pmc?.title,
    journalName: pmc?.journalName,
    doiUrl: pmc?.doiUrl,
    grants: pmc?.grants,
    hasReviewer: !!pmc?.reviewerEmail,
    hasCertification: !!pmc?.certifyManuscript,
  });

  await ctx.analytics.flush();

  return result;
}

/**
 * Unsets the preview flag for a PMC deposit.
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function unsetPreviewDeposit(workVersionId: string) {
  return safelyPatchPMCMetadata(workVersionId, {
    previewed: false,
  });
}
