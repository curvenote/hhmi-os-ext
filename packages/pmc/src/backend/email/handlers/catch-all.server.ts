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
} from '../email-db.server.js';
import { getPrismaClient } from '@curvenote/scms-server';
import { extractManuscriptId } from './email-parsing-utils.server.js';
import { resolveSubmissionVersionForManuscriptId } from '../manuscript-routing.server.js';

/**
 * Result of parsing a catch-all email
 */
export interface CatchAllParsedResult {
  from: string;
  subject: string;
  manuscriptId: string | null;
}

/**
 * Parses catch-all email content to extract basic information and manuscript IDs
 */
export function parseCatchAllEmail(payload: any): CatchAllParsedResult {
  const { envelope, headers, plain, html } = payload;
  const from = envelope?.from || 'unknown';
  const subject = headers?.subject || 'no subject';
  const content = html || plain || '';

  // Look for NIHMS manuscript ID pattern (NIHMS2109555)
  const manuscriptId = extractManuscriptId(content);

  return {
    from,
    subject,
    manuscriptId,
  };
}

/**
 * Finds submissions by manuscript ID in the format (NIHMS2109555)
 */
async function findSubmissionsByManuscriptId(manuscriptId: string): Promise<
  Array<{
    submissionId: string;
    submissionVersionId: string;
    packageId: string;
  }>
> {
  const resolved = await resolveSubmissionVersionForManuscriptId(manuscriptId);
  if (!resolved) return [];

  const prisma = await getPrismaClient();
  const withSubmission = await prisma.submissionVersion.findUnique({
    where: { id: resolved.id },
    select: {
      id: true,
      submission_id: true,
      work_version_id: true,
      metadata: true,
    },
  });
  if (!withSubmission) return [];

  const metadata = withSubmission.metadata as any;
  const packageId =
    metadata?.pmc?.emailProcessing?.packageId || withSubmission.work_version_id || 'unknown';

  return [
    {
      submissionId: withSubmission.submission_id,
      submissionVersionId: withSubmission.id,
      packageId,
    },
  ];
}

/**
 * Catch-all email handler for unhandled email types
 *
 * This handler accepts any email that doesn't match other handlers,
 * logs it for monitoring purposes, and marks it as ignored.
 * This provides visibility into unhandled email types and aids future development.
 */
export const catchAllHandler: InboundEmailHandler = {
  name: 'catch-all',
  description: 'Handles any email that does not match other specific handlers',

  /**
   * Identifies any email (catch-all behavior)
   * This handler should only be used when no other handler can process the email
   */
  identify(): boolean {
    // This handler should only be called when no other handler matches
    // The registry will call this as a fallback
    return true;
  },

  /**
   * Validates the email (always passes for catch-all)
   */
  validate(): EmailValidationResult {
    // Always validate as true for catch-all - we want to log everything
    return { isValid: true };
  },

  /**
   * Processes the catch-all email and attempts to find matching submissions
   * Includes parsing logic to extract manuscript IDs
   */
  async process(ctx: Context, payload: any, messageId: string): Promise<ProcessingResult> {
    const errors: string[] = [];
    let processedPackages = 0;

    try {
      // Parse email content to extract manuscript IDs
      const parsedResult = parseCatchAllEmail(payload);
      const { manuscriptId } = parsedResult;

      // If we found a manuscript ID, try to find matching submissions
      if (manuscriptId) {
        console.log(
          `Catch-all handler found manuscript ID: ${manuscriptId}, searching for matching submissions...`,
        );

        try {
          const matchingSubmissions = await findSubmissionsByManuscriptId(manuscriptId);

          if (matchingSubmissions.length > 0) {
            console.log(
              `Found ${matchingSubmissions.length} matching submission(s) for manuscript ID: ${manuscriptId}`,
            );

            // Process each matching submission
            for (const submission of matchingSubmissions) {
              try {
                // Create a package result similar to bulk submission handler
                const catchAllPackageResult = {
                  packageId: submission.packageId,
                  manuscriptId: manuscriptId,
                  status: 'success' as const,
                  message: `Catch-all handler processed email for manuscript ID ${manuscriptId}`,
                };

                // Update metadata and status if changed (skips if already at target status)
                const updated = await updateSubmissionMetadataAndStatusIfChanged(
                  ctx,
                  submission.packageId,
                  catchAllPackageResult,
                  messageId,
                  'IGNORED', // Status for catch-all processing
                  'catch-all', // Email type
                );

                if (updated) {
                  processedPackages++;
                  console.log(
                    `Updated submission ${submission.submissionId} with catch-all processing info`,
                  );
                }
              } catch (submissionError) {
                // Log the error but don't fail the entire process
                console.warn(
                  `Failed to update submission ${submission.submissionId}: ${submissionError instanceof Error ? submissionError.message : 'Unknown error'}`,
                );
                // Don't add this as an error - it's not critical for catch-all processing
              }
            }
          } else {
            console.log(`No matching submissions found for manuscript ID: ${manuscriptId}`);
            // Don't add this as an error - it's normal for catch-all to not find matches
          }
        } catch (searchError) {
          // Log the error but don't fail the entire process
          console.warn(
            `Failed to search for submissions with manuscript ID ${manuscriptId}: ${searchError instanceof Error ? searchError.message : 'Unknown error'}`,
          );
          // Don't add this as an error - it's not critical for catch-all processing
        }
      } else {
        console.log('Catch-all handler: No manuscript ID found in email content');
        // Don't add this as an error - it's normal for catch-all to not find manuscript IDs
      }

      // Update message status to IGNORED with catch-all reason
      try {
        await updateMessageStatus(ctx, messageId, 'IGNORED', {
          reason: 'Email processed by catch-all handler - no specific handler found',
          handlerType: 'catch-all',
          originalFrom: payload?.envelope?.from,
          originalSubject: payload?.headers?.subject,
          manuscriptId: manuscriptId || undefined,
          processedSubmissions: processedPackages,
        });
      } catch (updateError) {
        console.warn(
          `Failed to update message status: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`,
        );
        // Don't fail the entire process for this
      }

      // Determine final status - always return IGNORED for catch-all handler
      // unless there were critical errors that prevented processing
      let finalStatus: 'SUCCESS' | 'ERROR' | 'PARTIAL' | 'IGNORED' = 'IGNORED';
      if (errors.length > 0) {
        // Only return ERROR if there were critical errors that prevented processing
        // For catch-all, we want to be permissive and return IGNORED even with minor errors
        finalStatus = 'IGNORED';
      }

      return {
        messageId,
        status: finalStatus,
        processedDeposits: processedPackages,
        errors,
        processor: 'catch-all',
        parsedResult,
      };
    } catch (error) {
      console.error('Error in catch-all handler:', error);

      return {
        messageId,
        status: 'ERROR',
        processedDeposits: processedPackages,
        errors: [
          `Catch-all processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        processor: 'catch-all',
        parsedResult: undefined,
      };
    }
  },
};

/**
 * Configuration for catch-all handler
 */
export const catchAllConfig: EmailProcessorConfig = {
  subjectPatterns: [], // Accept all subjects
  enabled: true,
};
