import type { Context } from '@curvenote/scms-core';
import { getPrismaClient, $updateSubmissionVersion, SlackEventType } from '@curvenote/scms-server';
import { uuidv7 } from 'uuidv7';
import type { PackageResult } from './handlers/bulk-submission-parser.server.js';
import { safelyUpdatePMCSubmissionVersionMetadata } from '../submission-version-metadata.utils.server.js';
import type { EmailProcessing } from '../../common/metadata.schema.js';
import { INBOUND_EMAIL_SCHEMA } from '@curvenote/scms-server';

/**
 * Creates a new Message record in the database
 * Includes schema in results for UI rendering
 */
export async function createMessageRecord(
  ctx: Context,
  payload: any,
  results: any,
): Promise<string> {
  const prisma = await getPrismaClient();
  const now = new Date().toISOString();

  // Extract structured data from CloudMailin payload for schema-based rendering
  const structuredResults = {
    $schema: INBOUND_EMAIL_SCHEMA,
    from: payload.envelope?.from || payload.headers?.from || 'unknown',
    to: Array.isArray(payload.envelope?.to)
      ? payload.envelope.to[0]
      : payload.envelope?.to || payload.headers?.to || 'unknown',
    subject: payload.headers?.subject || 'no subject',
    receivedAt: payload.headers?.date || payload.envelope?.date || now,
    headers: payload.headers
      ? {
          from: payload.headers.from,
          to: payload.headers.to,
          subject: payload.headers.subject,
          date: payload.headers.date,
        }
      : undefined,
    envelope: payload.envelope
      ? {
          from: payload.envelope.from,
          to: payload.envelope.to,
        }
      : undefined,
    plain: payload.plain,
    html: payload.html,
  };

  // Merge with existing results if provided
  const finalResults = results
    ? {
        ...structuredResults,
        ...results,
        // Ensure schema is at the top level
        $schema: structuredResults.$schema,
      }
    : structuredResults;

  const message = await prisma.message.create({
    data: {
      id: uuidv7(),
      date_created: now,
      date_modified: now,
      module: 'PMC',
      type: 'inbound_email',
      status: 'PENDING',
      payload,
      results: finalResults,
    },
  });

  return message.id;
}

/**
 * Updates the message status in the database
 */
export async function updateMessageStatus(
  ctx: Context,
  messageId: string,
  status: 'PENDING' | 'SUCCESS' | 'ERROR' | 'PARTIAL' | 'IGNORED' | 'BOUNCED',
  results?: any,
): Promise<void> {
  const prisma = await getPrismaClient();
  // infrequent, unlikely concurrent no OCC
  const current = await prisma.message.findUnique({
    where: { id: messageId },
  });
  await prisma.message.update({
    where: { id: messageId },
    data: {
      status,
      results: {
        ...((current?.results as any) ?? {}),
        ...results,
      },
      date_modified: new Date().toISOString(),
    },
  });
}

/**
 * Updates submission version metadata with email processing results
 * Now supports per-type processing records
 */
export async function updateSubmissionVersionMetadata(
  ctx: Context,
  packageId: string,
  emailResult: PackageResult,
  messageId: string,
  targetStatus?: string, // Optional - only provided when the result of processing points clearly to a status
  processor: string = 'bulk-submission-initial-email', // Default for backward compatibility
): Promise<void> {
  const prisma = await getPrismaClient();

  // Find the submission version for this work version
  const submissionVersion = await prisma.submissionVersion.findFirst({
    where: { work_version_id: packageId },
    select: { id: true, status: true },
  });

  if (!submissionVersion) {
    throw new Error(`No submission version found for work version ${packageId}`);
  }

  // Update the submission version metadata using OCC
  const result = await safelyUpdatePMCSubmissionVersionMetadata(
    submissionVersion.id,
    (metadata) => {
      const existingEmailProcessing = metadata.emailProcessing;
      const existingMessages = existingEmailProcessing?.messages || [];

      // Create new message
      const newMessage = {
        type: (emailResult.status === 'success' ? 'info' : emailResult.status) as
          | 'info'
          | 'warning'
          | 'error',
        message: emailResult.message || '',
        timestamp: new Date().toISOString(),
        fromStatus: submissionVersion.status,
        toStatus: targetStatus ?? submissionVersion.status, // Fallback to current status if targetStatus is null/undefined
        messageId,
        processor, // Include the processor that created this message
      };

      // Add new message to history and sort by timestamp
      const updatedMessages = [...existingMessages, newMessage].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      // Calculate overall status based on message types
      const hasErrors = updatedMessages.some((msg) => msg.type === 'error');
      const hasWarnings = updatedMessages.some((msg) => msg.type === 'warning');
      const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok';

      // Prepare the email processing data
      const emailProcessing: EmailProcessing = {
        messageId,
        lastProcessedAt: new Date().toISOString(),
        packageId,
        status: overallStatus,
        messages: updatedMessages,
        ...(emailResult.manuscriptId && { manuscriptId: emailResult.manuscriptId }),
      };

      return {
        ...metadata,
        emailProcessing,
      };
    },
  );

  // Check if the result is an error Response and throw if so
  // Success case returns { success: true }, error case returns a Response object
  if (result instanceof Response) {
    const errorDetails = await result.json().catch(() => ({}));
    throw new Error(
      `Failed to update submission version metadata: ${errorDetails?.error?.error || 'Unknown error'}`,
    );
  }
}

/**
 * Helper function that checks for duplicate status and conditionally updates metadata and status
 * This prevents duplicate messages for repeated emails with the same target status
 *
 * @returns true if update was performed, false if skipped due to duplicate status
 */
export async function updateSubmissionMetadataAndStatusIfChanged(
  ctx: Context,
  packageId: string,
  emailResult: PackageResult,
  messageId: string,
  targetStatus: string,
  processor: string,
): Promise<boolean> {
  const prisma = await getPrismaClient();

  // Find the submission version for this work version
  const submissionVersion = await prisma.submissionVersion.findFirst({
    where: { work_version_id: packageId },
    select: { id: true, status: true, metadata: true },
  });

  if (!submissionVersion) {
    throw new Error(`No submission version found for work version ${packageId}`);
  }

  // Check if current status matches target status
  const isCurrentStatusDuplicate = submissionVersion.status === targetStatus;

  // Check if any previously processed message already has this target status
  const metadata = submissionVersion.metadata as any;
  const existingMessages = metadata?.pmc?.emailProcessing?.messages || [];
  const hasPreviousMessageWithTargetStatus = existingMessages.some(
    (msg: any) => msg.toStatus === targetStatus,
  );

  const isDuplicateStatus = isCurrentStatusDuplicate || hasPreviousMessageWithTargetStatus;

  // Only update metadata and status if this is a new status transition
  // This prevents duplicate messages for repeated emails (e.g., daily files request emails)
  if (!isDuplicateStatus) {
    // Update submission version metadata with status information
    await updateSubmissionVersionMetadata(
      ctx,
      packageId,
      emailResult,
      messageId,
      targetStatus,
      processor,
    );

    // Update submission status based on result type
    await updateSubmissionStatusOnReceivingEmail(ctx, packageId, targetStatus);

    return true;
  } else {
    const reason = isCurrentStatusDuplicate
      ? 'already at target status'
      : 'target status already processed in previous message';
    console.log(
      `Skipping metadata and status update for submission ${submissionVersion.id}: ${reason} (${targetStatus}, ${processor})`,
    );
    return false;
  }
}

/**
 * Updates the submission status using existing workflow functions
 */
export async function updateSubmissionStatusOnReceivingEmail(
  ctx: Context,
  workVersionId: string,
  status: string,
): Promise<void> {
  const prisma = await getPrismaClient();

  // Find the submission version for this work version
  const submissionVersion = await prisma.submissionVersion.findFirst({
    where: { work_version_id: workVersionId },
    select: {
      id: true,
      submitted_by_id: true,
    },
  });

  if (!submissionVersion) {
    throw new Error(`No submission found for work version ${workVersionId}`);
  }

  // Use the generic function with the submission owner as the user context
  // If no owner, we could use a system user ID or handle this differently
  const userId = submissionVersion.submitted_by_id || 'system';

  const updated = await $updateSubmissionVersion(userId, submissionVersion.id, {
    status,
  });
  await ctx.sendSlackNotification({
    eventType: SlackEventType.SUBMISSION_STATUS_CHANGED,
    message: `Submission status changed to ${updated.status}`,
    user: { id: userId },
    metadata: {
      status: updated.status,
      site: updated.submission.site.name,
      submissionId: updated.submission.id,
      submissionVersionId: updated.id,
    },
  });
}
