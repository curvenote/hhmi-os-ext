import { data as dataResponse } from 'react-router';
import type { SecureContext } from '@curvenote/scms-server';
import { getPrismaClient, revokeAccess } from '@curvenote/scms-server';
import {
  getComplianceAccessGrantedBy,
  createAccessWithComplianceReadScope,
} from '../../backend/access.server.js';
import { fetchScientistByOrcid } from '../../backend/airtable.scientists.server.js';
import { HHMITrackEvent } from '../../analytics/events.js';
import { getEmailTemplates } from '../../client.js';

/**
 * Get access grants for a scientist's compliance report by ORCID
 * Returns information about whether the scientist exists in the system
 */
export async function getScientistAccessGrants(ctx: SecureContext, orcid: string) {
  const prisma = await getPrismaClient();

  // Find the user who owns this ORCID
  const orcidOwner = await prisma.user.findFirst({
    where: {
      linkedAccounts: {
        some: {
          provider: 'orcid',
          idAtProvider: orcid,
          pending: false,
        },
      },
    },
    select: {
      id: true,
      username: true,
      display_name: true,
      email: true,
    },
  });

  if (!orcidOwner) {
    return {
      exists: false,
      accessGrants: [],
    };
  }

  // Get access grants for this scientist's report
  const accessGrants = await getComplianceAccessGrantedBy(orcidOwner.id);

  await ctx.trackEvent(HHMITrackEvent.HHMI_COMPLIANCE_ACCESS_GRANTS_VIEWED, {
    scientistOrcid: orcid,
    scientistUserId: orcidOwner.id,
    accessGrantCount: accessGrants.length,
  });

  // Get scientist name from Airtable if available
  const { scientist } = await fetchScientistByOrcid(orcid);
  const scientistName =
    scientist?.fullName || orcidOwner.display_name || orcidOwner.username || null;

  return {
    exists: true,
    accessGrants,
    scientistName,
    ownerId: orcidOwner.id,
  };
}

/**
 * Handle admin sharing a scientist's compliance report with another user
 */
export async function handleAdminShareComplianceReport(
  ctx: SecureContext,
  orcid: string,
  recipientUserId: string,
) {
  if (!orcid) {
    return dataResponse(
      {
        error: {
          type: 'validation',
          message: 'ORCID is required',
        },
      },
      { status: 400 },
    );
  }

  if (!recipientUserId) {
    return dataResponse(
      {
        error: {
          type: 'validation',
          message: 'Please select a user',
        },
      },
      { status: 400 },
    );
  }

  const prisma = await getPrismaClient();

  // Find the user who owns this ORCID
  const orcidOwner = await prisma.user.findFirst({
    where: {
      linkedAccounts: {
        some: {
          provider: 'orcid',
          idAtProvider: orcid,
          pending: false,
        },
      },
    },
    select: {
      id: true,
      username: true,
      display_name: true,
      email: true,
    },
  });

  if (!orcidOwner) {
    return dataResponse(
      {
        error: {
          type: 'validation',
          message: 'Scientist not found in system. They must have an account with linked ORCID.',
        },
      },
      { status: 404 },
    );
  }

  // Get recipient user information
  const recipient = await prisma.user.findUnique({
    where: { id: recipientUserId },
    select: {
      id: true,
      email: true,
      display_name: true,
      username: true,
    },
  });

  if (!recipient) {
    return dataResponse(
      {
        error: {
          type: 'validation',
          message: 'Recipient user not found',
        },
      },
      { status: 404 },
    );
  }

  // Security check: Prevent sharing with the owner themselves
  if (recipientUserId === orcidOwner.id) {
    return dataResponse(
      {
        error: {
          type: 'validation',
          message: 'Cannot grant access to the user themselves',
        },
      },
      { status: 400 },
    );
  }

  try {
    // Check if already shared
    const existingAccess = await getComplianceAccessGrantedBy(orcidOwner.id);
    const alreadyShared = existingAccess.some((access) => access.receiver_id === recipient.id);

    if (alreadyShared) {
      return dataResponse(
        {
          error: {
            type: 'validation',
            message: 'Report already shared with this user',
          },
        },
        { status: 400 },
      );
    }

    // Get scientist name for email
    const { scientist } = await fetchScientistByOrcid(orcid);
    const scientistName =
      scientist?.fullName || orcidOwner.display_name || orcidOwner.username || 'Unknown Scientist';

    // Share the report - owner is the scientist, granted by admin
    await createAccessWithComplianceReadScope(orcidOwner.id, recipient.id);

    await ctx.trackEvent(HHMITrackEvent.HHMI_COMPLIANCE_REPORT_SHARED, {
      admin: true,
      scientistOrcid: orcid,
      scientistUserId: orcidOwner.id,
      recipientUserId: recipient.id,
      recipientEmail: recipient.email,
      recipientDisplayName: recipient.display_name || recipient.username,
      adminUserId: ctx.user.id,
    });

    // Send email notification from admin on behalf of scientist
    if (recipient.email) {
      const reportUrl = ctx.asBaseUrl(`/app/compliance/shared/reports/${orcid}`);

      await ctx.sendEmail(
        {
          eventType: 'COMPLIANCE_REPORT_INVITATION',
          to: recipient.email,
          subject: `You've been granted access to view ${scientistName}'s compliance report`,
          templateProps: {
            scientistName,
            reportUrl,
            inviterName: ctx.user.display_name || ctx.user.username || 'HHMI Open Access Support',
            inviterEmail: ctx.user.email || undefined,
            recipientName: recipient.display_name || recipient.username || undefined,
            sharedByAdmin: true,
          },
        },
        getEmailTemplates(),
      );
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to grant access to compliance report:', error);
    return dataResponse(
      {
        error: {
          type: 'general',
          message: error instanceof Error ? error.message : 'Failed to grant access',
        },
      },
      { status: 500 },
    );
  }
}

/**
 * Handle admin revoking access to a compliance report
 * Admins can revoke any compliance report access grant
 */
export async function handleAdminRevokeComplianceAccess(ctx: SecureContext, accessId: string) {
  if (!accessId) {
    return dataResponse(
      {
        error: {
          type: 'validation',
          message: 'Access ID is required',
        },
      },
      { status: 400 },
    );
  }

  const prisma = await getPrismaClient();
  const access = await prisma.access.findUnique({
    where: { id: accessId },
  });

  if (!access) {
    return dataResponse(
      {
        error: {
          type: 'validation',
          message: 'Access not found',
        },
      },
      { status: 404 },
    );
  }

  // Security check: Verify this is a compliance report access
  const { hhmi } = await import('../../backend/scopes.js');
  const grants = access.grants as any;
  const isComplianceAccess = grants.scopes?.includes(hhmi.compliance.read) || false;

  if (!isComplianceAccess) {
    return dataResponse(
      {
        error: {
          type: 'validation',
          message: 'This access record is not a compliance report access',
        },
      },
      { status: 400 },
    );
  }

  try {
    // Get receiver information for analytics before revoking
    const receiver = access.receiver_id
      ? await prisma.user.findUnique({
          where: { id: access.receiver_id },
          select: { id: true, email: true, display_name: true, username: true },
        })
      : null;

    // Pass admin user ID for activity tracking
    await revokeAccess(accessId, ctx.user.id);

    await ctx.trackEvent(HHMITrackEvent.HHMI_COMPLIANCE_REPORT_ACCESS_REVOKED, {
      admin: true,
      accessId,
      receiverUserId: access.receiver_id,
      receiverEmail: receiver?.email,
      receiverDisplayName: receiver?.display_name || receiver?.username,
      ownerUserId: access.owner_id,
      adminUserId: ctx.user.id,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to revoke compliance access:', error);
    return dataResponse(
      {
        error: {
          type: 'general',
          message: error instanceof Error ? error.message : 'Failed to revoke access',
        },
      },
      { status: 500 },
    );
  }
}
