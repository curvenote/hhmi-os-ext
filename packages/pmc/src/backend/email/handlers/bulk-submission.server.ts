import type { Context } from '@curvenote/scms-core';
import type {
  InboundEmailHandler,
  EmailValidationResult,
  ProcessingResult,
  EmailProcessorConfig,
} from '../types.server.js';
import {
  parseEmailContent,
  isDirectSubmissionOnlyError,
  type ParsedEmailResult,
} from './bulk-submission-parser.server.js';
import { updateSubmissionMetadataAndStatusIfChanged } from '../email-db.server.js';

/**
 * Bulk submission email handler
 *
 * Handles emails from NIHMS about bulk submission processing results.
 * These emails contain package-to-manuscript ID mappings and processing status.
 */
export const bulkSubmissionHandler: InboundEmailHandler = {
  name: 'bulk-submission-initial-email',
  description: 'Handles NIHMS bulk submission processing result emails',

  /**
   * Identifies bulk submission emails by basic criteria
   * This is a quick routing check - detailed validation happens in validate()
   */
  identify(payload: any): boolean {
    const { headers } = payload;

    // Must have basic email structure
    if (!headers?.subject) {
      return false;
    }

    const subject = headers.subject.toLowerCase();

    // Check if subject contains bulk submission keywords (quick check)
    const hasBulkSubmissionKeywords =
      subject.includes('bulk') ||
      subject.includes('submission') ||
      subject.includes('package') ||
      subject.includes('manuscript');

    // Return true if it looks like it could be a bulk submission email
    // The validate() method will do the detailed checking
    return hasBulkSubmissionKeywords;
  },

  /**
   * Validates bulk submission email
   */
  validate(payload: any, config: EmailProcessorConfig): EmailValidationResult {
    const { headers } = payload;

    // Check subject
    if (!headers?.subject) {
      return { isValid: false, reason: 'Missing subject' };
    }

    const subject = headers.subject.toLowerCase();
    const isValidSubject = config.subjectPatterns.some((pattern) =>
      subject.includes(pattern.toLowerCase()),
    );

    if (!isValidSubject) {
      return {
        isValid: false,
        reason: `Subject "${headers.subject}" does not match expected patterns`,
      };
    }

    return { isValid: true };
  },

  /**
   * Processes bulk submission email results
   * Includes parsing logic specific to bulk submission emails
   */
  async process(ctx: Context, payload: any, messageId: string): Promise<ProcessingResult> {
    const errors: string[] = [];
    let processedDeposits = 0;

    try {
      // Parse email content to extract package results
      const { plain, html } = payload;
      const parsedResult: ParsedEmailResult = parseEmailContent(plain || '', html || '');

      // Process each package independently
      for (const packageResult of parsedResult.packages) {
        try {
          // Determine the target status based on result type (errors always go to DEPOSIT_REJECTED_BY_PMC first)
          type BulkTargetStatus = 'DEPOSIT_CONFIRMED_BY_PMC' | 'DEPOSIT_REJECTED_BY_PMC';
          let targetStatus: BulkTargetStatus;
          if (packageResult.status === 'success' || packageResult.status === 'warning') {
            targetStatus = 'DEPOSIT_CONFIRMED_BY_PMC';
          } else if (packageResult.status === 'error') {
            targetStatus = 'DEPOSIT_REJECTED_BY_PMC';
          } else {
            throw new Error(`Unknown package status: ${packageResult.status}`);
          }

          // First transition: update metadata and status (e.g. to DEPOSIT_REJECTED_BY_PMC for errors)
          await updateSubmissionMetadataAndStatusIfChanged(
            ctx,
            packageResult.packageId,
            packageResult,
            messageId,
            targetStatus,
            'bulk-submission-initial-email',
          );

          // For "direct submission only" errors, make a second transition to NO_ACTION_NEEDED
          // so we pass through DEPOSIT_REJECTED_BY_PMC and both status changes are recorded as activities
          if (
            packageResult.status === 'error' &&
            isDirectSubmissionOnlyError(packageResult.message)
          ) {
            await updateSubmissionMetadataAndStatusIfChanged(
              ctx,
              packageResult.packageId,
              packageResult,
              messageId,
              'NO_ACTION_NEEDED',
              'bulk-submission-initial-email',
            );
          }

          // TODO: if we are going to send an email to the submitter
          // we would prepare the content and queue it here

          processedDeposits++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error processing package';
          errors.push(`Package ${packageResult.packageId}: ${errorMessage}`);
        }
      }

      // Determine final status
      let finalStatus: 'SUCCESS' | 'ERROR' | 'PARTIAL' = 'SUCCESS';
      if (errors.length > 0) {
        finalStatus = processedDeposits > 0 ? 'PARTIAL' : 'ERROR';
      }

      return {
        messageId,
        status: finalStatus,
        processedDeposits,
        errors,
        processor: 'bulk-submission-initial-email',
        parsedResult, // Include the parsed email data
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      errors.push(errorMessage);

      return {
        messageId,
        status: 'ERROR',
        processedDeposits,
        errors,
        processor: 'bulk-submission-initial-email',
        parsedResult: undefined, // No parsed result on error
      };
    }
  },
};

/**
 * Default configuration for bulk submission emails
 */
export const bulkSubmissionConfig: EmailProcessorConfig = {
  subjectPatterns: ['bulk submission'],
  enabled: true,
};
