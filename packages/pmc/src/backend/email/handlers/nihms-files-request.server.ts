import { getPrismaClient } from '@curvenote/scms-server';
import type { Context } from '@curvenote/scms-core';
import type {
  InboundEmailHandler,
  EmailProcessorConfig,
  EmailValidationResult,
  ProcessingResult,
} from '../types.server.js';
import {
  updateMessageStatus,
  updateSubmissionMetadataAndStatusIfChanged,
  updateSubmissionStatusOnReceivingEmail,
} from '../email-db.server.js';
import { extractManuscriptId } from './email-parsing-utils.server.js';
import { getEmailTemplates } from '../../../client.js';
import { PMC_NIHMS_FILES_REQUESTED } from '../../emails/nihms-files-requested.js';

/**
 * Strips all HTML tags and decodes HTML entities from text
 */
function stripHtmlTags(text: string): string {
  return (
    text
      // Remove HTML tags FIRST (before decoding entities)
      // This prevents decoded entities like &lt; and &gt; from being treated as tags
      // Match common HTML tags with optional attributes
      .replace(/<\/?[a-z][a-z0-9]*[^>]*>/gi, '')
      // Decode common HTML entities
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
      .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
      // Normalize multiple spaces but preserve line breaks
      .replace(/ {2,}/g, ' ')
      .trim()
  );
}

/**
 * Result of parsing a NIHMS files request email
 */
export interface FilesRequestParsedResult {
  from: string;
  subject: string;
  cleanSubject: string;
  manuscriptId: string | null;
  message: string;
}

/**
 * Parses NIHMS files request email content to extract manuscript ID and message
 */
export function parseFilesRequestEmail(payload: any): FilesRequestParsedResult {
  const { envelope, headers, plain, html } = payload;
  const from = envelope?.from || 'unknown';
  const subject = headers?.subject || 'no subject';

  // Clean subject line (remove Fw:, Re:, Fwd: prefixes and strip HTML)
  const cleanSubject = stripHtmlTags(
    subject
      .replace(/^(Fw:|Re:|Fwd:)\s*/gi, '')
      .replace(/^(Fw:|Re:|Fwd:)\s*/gi, '') // Run twice to catch multiple prefixes
      .trim(),
  );

  // Extract content for parsing - prioritize plain text over HTML
  const content = plain || html || '';

  // Extract manuscript ID from body
  const manuscriptId = extractManuscriptId(content);

  // Best-effort extraction of the message segment between known markers.
  // If markers are missing, we fall back to a fixed message rather than exposing raw email content.
  const FALLBACK_MESSAGE =
    'We could not determine the reason for this request from the email from NIHMS. For further assistance, please contact the HHMI Workspace Support Team.';

  let parsedMessage = '';
  try {
    const startPattern = /[^\n]*Howard Hughes Medical Institute,/i;
    const startMatch = startPattern.exec(content);

    if (startMatch) {
      const endMarker = 'To access the manuscript record';
      const endIndex = content.indexOf(endMarker, startMatch.index);

      const messageContent =
        endIndex !== -1
          ? content.substring(startMatch.index + startMatch[0].length, endIndex).trim()
          : content.substring(startMatch.index + startMatch[0].length).trim();

      const cleanedContent = stripHtmlTags(messageContent);

      parsedMessage = cleanedContent
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/^\s+/, '')
        .replace(/\s+$/, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .trim();
    }
  } catch (error) {
    console.warn('Error parsing message content:', error);
  }

  const fullMessage = parsedMessage
    ? `${cleanSubject}\n\n${parsedMessage}`.trim()
    : `${cleanSubject}\n\n${FALLBACK_MESSAGE}`;

  return {
    from,
    subject,
    cleanSubject,
    manuscriptId,
    message: fullMessage,
  };
}

/**
 * NIHMS Files Request Handler
 * Handles emails from NIHMS requesting additional files to be uploaded
 */
export const nihmsFilesRequestHandler: InboundEmailHandler = {
  name: 'nihms-files-request',
  description: 'Handles NIHMS emails requesting additional files to be uploaded',

  /**
   * Identifies emails that are NIHMS files request emails
   * Looks for subject containing "Please upload" before "to NIHMS"
   */
  identify(payload: any): boolean {
    const { headers } = payload;

    // Must have basic email structure
    if (!headers?.subject) {
      return false;
    }

    const subject = headers.subject.toLowerCase();

    // Check if subject contains the required pattern: "Please upload" before "to NIHMS"
    const pleaseUploadIndex = subject.indexOf('please upload');
    const toNihmsIndex = subject.indexOf('to nihms');

    const hasCorrectPattern =
      pleaseUploadIndex !== -1 && toNihmsIndex !== -1 && pleaseUploadIndex < toNihmsIndex;

    return hasCorrectPattern;
  },

  /**
   * Validates the email content for NIHMS files request
   */
  validate(payload: any): EmailValidationResult {
    const { headers, plain, html } = payload;

    // Basic validation
    if (!headers?.subject) {
      return {
        isValid: false,
        reason: 'Missing required email fields (headers.subject)',
      };
    }

    // Validate subject contains required strings (case-insensitive)
    const subject = headers.subject.toLowerCase();
    if (!subject.includes('please upload')) {
      return {
        isValid: false,
        reason: 'Subject must contain "please upload"',
      };
    }

    if (!subject.includes('to nihms')) {
      return {
        isValid: false,
        reason: 'Subject must contain "to NIHMS"',
      };
    }

    // Check if email has content to parse
    const content = html || plain || '';
    if (!content.trim()) {
      return {
        isValid: false,
        reason: 'Email has no content to parse',
      };
    }

    return { isValid: true };
  },

  /**
   * Processes the NIHMS files request email
   * Includes parsing logic to extract manuscript ID and message content
   */
  async process(ctx: Context, payload: any, messageId: string): Promise<ProcessingResult> {
    const errors: string[] = [];

    try {
      // Parse email content
      const parsedResult = parseFilesRequestEmail(payload);
      const { from, subject, manuscriptId, message: fullMessage } = parsedResult;

      if (!manuscriptId) {
        errors.push('No NIHMS manuscript ID found in email content.');
        await updateMessageStatus(ctx, messageId, 'IGNORED', {
          reason: 'No NIHMS manuscript ID found in email content',
          processor: 'nihms-files-request',
          originalFrom: from,
          originalSubject: subject,
        });
        return {
          messageId,
          status: 'IGNORED',
          processedDeposits: 0,
          errors,
          processor: 'nihms-files-request',
          parsedResult,
        };
      }

      // Find the submission version associated with this manuscript ID
      const prisma = await getPrismaClient();
      const submissionVersion = await prisma.submissionVersion.findFirst({
        where: {
          metadata: {
            path: ['pmc', 'emailProcessing', 'manuscriptId'],
            equals: manuscriptId,
          },
        },
        select: {
          id: true,
          work_version_id: true,
          submitted_by_id: true,
          status: true,
          work_version: {
            select: {
              work_id: true,
            },
          },
        },
      });

      if (!submissionVersion) {
        errors.push(`No submission found for NIHMS manuscript ID: ${manuscriptId}`);
        await updateMessageStatus(ctx, messageId, 'IGNORED', {
          reason: `No submission found for NIHMS manuscript ID: ${manuscriptId}`,
          processor: 'nihms-files-request',
          originalFrom: from,
          originalSubject: subject,
          manuscriptId,
        });
        return {
          messageId,
          status: 'IGNORED',
          processedDeposits: 0,
          errors,
          processor: 'nihms-files-request',
          parsedResult,
        };
      }

      // Create package result for metadata update
      const packageResult = {
        packageId: submissionVersion.work_version_id,
        manuscriptId: manuscriptId,
        status: 'warning' as const,
        message: fullMessage,
      };

      // Update metadata and status if changed (skips if already at target status)
      const wasUpdated = await updateSubmissionMetadataAndStatusIfChanged(
        ctx,
        submissionVersion.work_version_id,
        packageResult,
        messageId,
        'SUBMITTERS_FILES_REQUESTED',
        'nihms-files-request',
      );

      // Send notification email to submitter
      const submitter = await prisma.user.findUnique({
        where: { id: submissionVersion.submitted_by_id },
        select: { email: true, display_name: true },
      });

      const depositUrl = ctx.asBaseUrl(
        `/app/works/${submissionVersion.work_version.work_id}/site/pmc/deposit/${submissionVersion.id}`,
      );

      const templateProps = {
        submitterName: submitter?.display_name || undefined,
        manuscriptId,
        message: fullMessage,
        depositUrl,
      };

      if (submitter?.email) {
        try {
          await ctx.sendEmail(
            {
              eventType: PMC_NIHMS_FILES_REQUESTED,
              to: submitter.email,
              subject: `NIHMS Files Requested for ${manuscriptId}`,
              templateProps,
              ignoreUnsubscribe: false,
            },
            getEmailTemplates(),
          );
          console.log(
            `Email sent: Sent files requested notification to ${submitter.email} for manuscript ${manuscriptId}`,
          );
        } catch (emailError) {
          // Don't fail the entire processing if email fails
          console.error('Failed to send files requested notification email:', emailError);
        }
      } else {
        console.warn(
          `Cannot send notification email: submitter ${submissionVersion.submitted_by_id} has no email address`,
        );
        if (wasUpdated && ctx.$config.app?.supportEmail) {
          console.log(`Sending email to support email address: ${ctx.$config.app?.supportEmail}`);
          // this is (probably) the first time the email was received
          // send an email to the support email address to notify them that the request was received but the email was not sent to the submitter
          await ctx.sendEmail(
            {
              eventType: PMC_NIHMS_FILES_REQUESTED,
              to: ctx.$config.app?.supportEmail,
              subject: `NIHMS Files Request Received but Email Not Sent to Submitter`,
              templateProps,
            },
            getEmailTemplates(),
          );
        }
      }

      // Always transition to REQUEST_NEW_VERSION when NIHMS requests files - the inbound email is the
      // authoritative trigger. The submitter must be able to upload a new version regardless of whether
      // we could send the notification email.
      if (submissionVersion.status !== 'REQUEST_NEW_VERSION') {
        await updateSubmissionStatusOnReceivingEmail(
          ctx,
          submissionVersion.work_version_id,
          'REQUEST_NEW_VERSION',
        );
      } else {
        console.log(
          `Submission ${submissionVersion.work_version_id} is already in REQUEST_NEW_VERSION status, skipping status update`,
        );
      }

      return {
        messageId,
        status: 'SUCCESS',
        processedDeposits: 1,
        errors,
        processor: 'nihms-files-request',
        parsedResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      errors.push(errorMessage);

      return {
        messageId,
        status: 'ERROR',
        processedDeposits: 0,
        errors,
        processor: 'nihms-files-request',
        parsedResult: undefined,
      };
    }
  },
};

/**
 * Configuration for NIHMS files request handler
 */
export const nihmsFilesRequestConfig: EmailProcessorConfig = {
  subjectPatterns: ['Please upload.*to NIHMS'],
  enabled: true,
};
