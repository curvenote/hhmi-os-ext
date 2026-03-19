import type { Context } from '@curvenote/scms-core';
import { SlackEventType } from '@curvenote/scms-server';
import { pmcEmailProcessorRegistry, type ProcessingResult } from './types.server.js';
import { initializeEmailProcessorRegistry, getEmailProcessorConfig } from './registry.server.js';
import { createMessageRecord, updateMessageStatus } from './email-db.server.js';
import { validateEmailSender } from './email-validation.server.js';

// Initialize the registry on module load
initializeEmailProcessorRegistry();

const SUBJECT_MAX_LEN = 200;

function slackColorForInboundStatus(
  status: ProcessingResult['status'],
): 'good' | 'warning' | 'danger' {
  switch (status) {
    case 'SUCCESS':
      return 'good';
    case 'PARTIAL':
    case 'IGNORED':
    case 'PENDING':
      return 'warning';
    case 'BOUNCED':
    case 'ERROR':
      return 'danger';
    default:
      return 'warning';
  }
}

async function sendInboundEmailSlackNotification(
  ctx: Context,
  payload: any,
  result: Pick<ProcessingResult, 'messageId' | 'status' | 'errors' | 'processor'>,
): Promise<void> {
  const subjectRaw = String(payload?.headers?.subject ?? '(no subject)');
  const subject =
    subjectRaw.length > SUBJECT_MAX_LEN
      ? `${subjectRaw.slice(0, SUBJECT_MAX_LEN - 3)}...`
      : subjectRaw;
  const fromAddr = String(payload?.envelope?.from ?? '(unknown)');

  const messageLink =
    result.messageId && result.messageId !== 'unknown'
      ? ctx.asBaseUrl(`/app/platform/messages/${result.messageId}`)
      : undefined;

  const metadata: Record<string, string> = {
    status: result.status,
    from: fromAddr,
    ...(messageLink ? { messageLink } : {}),
    ...(result.processor ? { processor: result.processor } : {}),
  };

  if (result.errors?.length) {
    metadata.errors = result.errors.join('; ');
  }

  await ctx.sendSlackNotification({
    eventType: SlackEventType.INBOUND_EMAIL_RECEIVED,
    message: `PMC inbound email: ${subject}`,
    color: slackColorForInboundStatus(result.status),
    metadata,
  });
}

/**
 * Main processing function that orchestrates the entire email processing workflow
 * Now uses the email type registry to route emails to appropriate handlers
 */
export async function processInboundEmail(ctx: Context, payload: any): Promise<ProcessingResult> {
  const errors: string[] = [];
  let processedDeposits = 0;

  try {
    // Step 1: Validate sender (early security check)
    const allowedSenders = ctx.$config?.app?.extensions?.pmc?.inboundEmail?.senders || [];
    const senderValidation = validateEmailSender(payload.envelope, allowedSenders);
    if (!senderValidation.isValid) {
      const messageId = await createMessageRecord(ctx, payload, { validation: senderValidation });
      await updateMessageStatus(ctx, messageId, 'BOUNCED', senderValidation);
      const bounced: ProcessingResult = {
        messageId,
        status: 'BOUNCED',
        processedDeposits: 0,
        errors: [senderValidation.reason || 'Sender validation failed'],
      };
      await sendInboundEmailSlackNotification(ctx, payload, bounced);
      return bounced;
    }

    // Step 2: Identify email type
    const processorName = pmcEmailProcessorRegistry.identifyProcessor(payload);
    if (!processorName) {
      // No handler can process this email - treat as ignored
      const messageId = await createMessageRecord(ctx, payload, {
        validation: { reason: 'No email type handler found' },
      });
      await updateMessageStatus(ctx, messageId, 'IGNORED', {
        reason: 'No email type handler found',
        availableTypes: pmcEmailProcessorRegistry.getAllProcessorNames(),
      });

      const ignoredNoHandler: ProcessingResult = {
        messageId,
        status: 'IGNORED',
        processedDeposits: 0,
        errors: ['No email type handler found for this email'],
      };
      await sendInboundEmailSlackNotification(ctx, payload, ignoredNoHandler);
      return ignoredNoHandler;
    }

    // Step 3: Get the appropriate handler
    const handler = pmcEmailProcessorRegistry.getHandler(processorName);
    if (!handler) {
      throw new Error(`Handler not found for email type: ${processorName}`);
    }

    // Step 4: Get configuration for this email type
    const config = getEmailProcessorConfig(processorName, ctx.$config);

    // Step 5: Validate email content using type-specific validation
    const validation = handler.validate(payload, config);
    if (!validation.isValid) {
      // Log validation failure
      console.warn(`Email validation failed for type ${processorName}:`, {
        from: payload?.envelope?.from,
        subject: payload?.headers?.subject,
        reason: validation.reason,
        timestamp: new Date().toISOString(),
      });

      // For other validation failures, ignore the email
      const messageId = await createMessageRecord(ctx, payload, { validation });
      await updateMessageStatus(ctx, messageId, 'IGNORED', validation);

      const ignoredValidation: ProcessingResult = {
        messageId,
        status: 'IGNORED',
        processedDeposits: 0,
        errors: [validation.reason || 'Email validation failed'],
        processor: processorName,
      };
      await sendInboundEmailSlackNotification(ctx, payload, ignoredValidation);
      return ignoredValidation;
    }

    // Step 6: Create initial message record
    const messageId = await createMessageRecord(ctx, payload, null);

    try {
      // Step 7: Process email (parsing happens inside handler)
      const result = await handler.process(ctx, payload, messageId);

      // Update the processed packages count from the result
      processedDeposits = result.processedDeposits || 0;

      // Step 8: Update message status based on results
      await updateMessageStatus(ctx, messageId, result.status, {
        processor: result.processor,
        processedDeposits: result.processedDeposits,
        parsedResult: result.parsedResult,
        errors: result.errors,
      });

      await sendInboundEmailSlackNotification(ctx, payload, {
        messageId: result.messageId ?? messageId,
        status: result.status,
        errors: result.errors,
        processor: result.processor,
      });
      return result;
    } catch (error) {
      // Handle processing errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      errors.push(errorMessage);

      await updateMessageStatus(ctx, messageId, 'ERROR', {
        processor: processorName,
        error: errorMessage,
        errors,
      });

      const processingError: ProcessingResult = {
        messageId,
        status: 'ERROR',
        processedDeposits,
        errors,
        processor: processorName,
      };
      await sendInboundEmailSlackNotification(ctx, payload, processingError);
      return processingError;
    }
  } catch (error) {
    // Handle any unexpected errors
    const errorMessage = error instanceof Error ? error.message : 'Unexpected error';
    errors.push(errorMessage);

    const fatal: ProcessingResult = {
      messageId: 'unknown',
      status: 'ERROR',
      processedDeposits,
      errors,
    };
    await sendInboundEmailSlackNotification(ctx, payload, fatal);
    return fatal;
  }
}
