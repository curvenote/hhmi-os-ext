// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processInboundEmail } from '../src/backend/email/email-processor.server.js';
import type { Context } from '@curvenote/scms-server';
import { pmcEmailProcessorRegistry } from '../src/backend/email/types.server.js';
import { createMessageRecord, updateMessageStatus } from '../src/backend/email/email-db.server.js';
import { getEmailProcessorConfig } from '../src/backend/email/registry.server.js';

// Mock the email type registry
vi.mock('../src/backend/email/registry.server.js', () => ({
  initializeEmailProcessorRegistry: vi.fn(),
  getEmailProcessorConfig: vi.fn(),
}));

// Mock the email-db.server functions
vi.mock('../src/backend/email/email-db.server.js', () => ({
  createMessageRecord: vi.fn(),
  updateMessageStatus: vi.fn(),
}));

// Mock the email type registry
vi.mock('../src/backend/email/types.server.js', () => ({
  pmcEmailProcessorRegistry: {
    identifyProcessor: vi.fn(),
    getHandler: vi.fn(),
    getAllProcessorNames: vi.fn(),
  },
}));

describe('Email Processor', () => {
  let mockContext: Context;
  let mockBulkSubmissionHandler: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      $config: {
        app: {
          extensions: {
            pmc: {
              inboundEmail: {
                senders: ['nihms-help@ncbi.nlm.nih.gov'],
              },
            },
          },
        },
      },
      sendSlackNotification: vi.fn().mockResolvedValue(undefined),
      asBaseUrl: (path: string) => `https://example.test${path}`,
    } as any;

    // Mock handlers
    mockBulkSubmissionHandler = {
      type: 'bulk-submission-initial-email',
      identify: vi.fn(),
      validate: vi.fn(),
      process: vi.fn(),
    };
  });

  describe('Sender Validation (Step 1)', () => {
    it('should reject emails from unauthorized senders', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');

      const payload = {
        envelope: { from: 'unauthorized@example.com' },
        headers: { subject: 'Test subject' },
        plain: 'Test content',
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.messageId).toBe('msg-123');
      expect(result.status).toBe('BOUNCED');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Sender unauthorized@example.com not in allowed list');

      expect(createMessageRecord).toHaveBeenCalledWith(mockContext, payload, {
        validation: {
          isValid: false,
          reason: 'Sender unauthorized@example.com not in allowed list',
        },
      });
      expect(updateMessageStatus).toHaveBeenCalledWith(mockContext, 'msg-123', 'BOUNCED', {
        isValid: false,
        reason: 'Sender unauthorized@example.com not in allowed list',
      });
    });

    it('should reject emails with no sender', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');

      const payload = {
        envelope: {},
        headers: { subject: 'Test subject' },
        plain: 'Test content',
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('BOUNCED');
      expect(result.errors[0]).toContain('Missing sender information');
    });

    it('should reject emails when no allowed senders configured', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');

      const contextWithNoSenders = {
        ...mockContext,
        $config: {
          app: {
            extensions: {
              pmc: {
                inboundEmail: {
                  senders: [],
                },
              },
            },
          },
        },
      } as any;

      const payload = {
        envelope: { from: 'any@example.com' },
        headers: { subject: 'Test subject' },
        plain: 'Test content',
      };

      const result = await processInboundEmail(contextWithNoSenders, payload);

      expect(result.status).toBe('BOUNCED');
      expect(result.errors[0]).toContain('not in allowed list');
    });

    it('should accept emails from authorized senders', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(
        'bulk-submission-initial-email',
      );
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockBulkSubmissionHandler);
      vi.mocked(mockBulkSubmissionHandler.validate).mockReturnValue({ isValid: true });
      vi.mocked(mockBulkSubmissionHandler.process).mockResolvedValue({
        messageId: 'msg-123',
        status: 'SUCCESS',
        processedDeposits: 1,
        errors: [],
        processor: 'bulk-submission-initial-email',
      });

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=test-123 was processed',
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(1);
    });
  });

  describe('Email Type Identification (Step 2)', () => {
    it('should handle emails that cannot be identified by any handler', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(null);
      vi.mocked(pmcEmailProcessorRegistry.getAllProcessorNames).mockReturnValue([
        'bulk-submission-initial-email',
        'catch-all',
      ]);

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Unknown email type' },
        plain: 'Unknown content',
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('IGNORED');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('No email type handler found for this email');

      expect(updateMessageStatus).toHaveBeenCalledWith(mockContext, 'msg-123', 'IGNORED', {
        reason: 'No email type handler found',
        availableTypes: ['bulk-submission-initial-email', 'catch-all'],
      });
    });

    it('should handle errors during email type identification', async () => {
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockImplementation(() => {
        throw new Error('Registry error');
      });

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Test subject' },
        plain: 'Test content',
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('ERROR');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Registry error');
    });
  });

  describe('Handler Processing (Steps 3-8)', () => {
    it('should process emails successfully with valid handler', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(
        'bulk-submission-initial-email',
      );
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockBulkSubmissionHandler);
      vi.mocked(getEmailProcessorConfig).mockReturnValue({
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });
      vi.mocked(mockBulkSubmissionHandler.validate).mockReturnValue({ isValid: true });
      vi.mocked(mockBulkSubmissionHandler.process).mockResolvedValue({
        messageId: 'msg-123',
        status: 'SUCCESS',
        processedDeposits: 1,
        errors: [],
        processor: 'bulk-submission-initial-email',
      });

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=test-123 was processed',
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(1);
      expect(result.processor).toBe('bulk-submission-initial-email');

      expect(mockBulkSubmissionHandler.validate).toHaveBeenCalledWith(payload, {
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });
      expect(mockBulkSubmissionHandler.process).toHaveBeenCalledWith(
        mockContext,
        payload,
        'msg-123',
      );
    });

    it('should handle handler not found error', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue('unknown-handler');
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(null);

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Test subject' },
        plain: 'Test content',
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('ERROR');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Handler not found for email type: unknown-handler');
    });

    it('should handle validation failures', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(
        'bulk-submission-initial-email',
      );
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockBulkSubmissionHandler);
      vi.mocked(getEmailProcessorConfig).mockReturnValue({
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });
      vi.mocked(mockBulkSubmissionHandler.validate).mockReturnValue({
        isValid: false,
        reason: 'Subject does not match expected patterns',
      });

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Wrong subject' },
        plain: 'Test content',
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('IGNORED');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Subject does not match expected patterns');

      expect(updateMessageStatus).toHaveBeenCalledWith(mockContext, 'msg-123', 'IGNORED', {
        isValid: false,
        reason: 'Subject does not match expected patterns',
      });
    });

    it('should handle parsing errors', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(
        'bulk-submission-initial-email',
      );
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockBulkSubmissionHandler);
      vi.mocked(getEmailProcessorConfig).mockReturnValue({
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });
      vi.mocked(mockBulkSubmissionHandler.validate).mockReturnValue({ isValid: true });
      vi.mocked(mockBulkSubmissionHandler.process).mockImplementation(() => {
        throw new Error('Processing failed');
      });

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: 'Invalid content',
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('ERROR');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Processing failed');

      expect(updateMessageStatus).toHaveBeenCalledWith(mockContext, 'msg-123', 'ERROR', {
        processor: 'bulk-submission-initial-email',
        error: 'Processing failed',
        errors: ['Processing failed'],
      });
    });

    it('should handle processing errors', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(
        'bulk-submission-initial-email',
      );
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockBulkSubmissionHandler);
      vi.mocked(getEmailProcessorConfig).mockReturnValue({
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });
      vi.mocked(mockBulkSubmissionHandler.validate).mockReturnValue({ isValid: true });
      vi.mocked(mockBulkSubmissionHandler.process).mockImplementation(() => {
        throw new Error('Processing failed');
      });

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=test-123 was processed',
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('ERROR');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Processing failed');

      expect(updateMessageStatus).toHaveBeenCalledWith(mockContext, 'msg-123', 'ERROR', {
        processor: 'bulk-submission-initial-email',
        error: 'Processing failed',
        errors: ['Processing failed'],
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors during processing', async () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Test subject' },
        plain: 'Test content',
      };

      // Mock an unexpected error
      vi.mocked(createMessageRecord).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('ERROR');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Unexpected error');
    });

    it('should handle non-Error exceptions', async () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Test subject' },
        plain: 'Test content',
      };

      // Mock a non-Error exception
      vi.mocked(createMessageRecord).mockImplementation(() => {
        throw 'String error';
      });

      const result = await processInboundEmail(mockContext, payload);

      expect(result.status).toBe('ERROR');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Unexpected error');
    });
  });

  describe('Complete Workflow Integration', () => {
    it('should process a complete successful email workflow', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(
        'bulk-submission-initial-email',
      );
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockBulkSubmissionHandler);
      vi.mocked(getEmailProcessorConfig).mockReturnValue({
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });
      vi.mocked(mockBulkSubmissionHandler.validate).mockReturnValue({ isValid: true });
      vi.mocked(mockBulkSubmissionHandler.process).mockResolvedValue({
        messageId: 'msg-123',
        status: 'SUCCESS',
        processedDeposits: 2,
        errors: [],
        processor: 'bulk-submission-initial-email',
      });

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission processing results' },
        plain: 'Package ID=pkg-123 for Manuscript ID ms-456 was processed successfully',
        html: `
          <table>
            <tr>
              <td>SUCCESS</td>
              <td>Package ID=pkg-123 for Manuscript ID ms-456 was processed successfully</td>
            </tr>
            <tr>
              <td>WARNING</td>
              <td>Package ID=pkg-789 for Manuscript ID ms-012 has minor issues</td>
            </tr>
          </table>
        `,
      };

      const result = await processInboundEmail(mockContext, payload);

      expect(result.messageId).toBe('msg-123');
      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.processor).toBe('bulk-submission-initial-email');

      // Verify all steps were called
      expect(mockBulkSubmissionHandler.validate).toHaveBeenCalledTimes(1);
      expect(mockBulkSubmissionHandler.process).toHaveBeenCalledTimes(1);
    });
  });
});
