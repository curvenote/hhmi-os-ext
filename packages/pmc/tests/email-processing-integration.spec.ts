// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processInboundEmail } from '../src/backend/email/email-processor.server.js';
import type { Context } from '@curvenote/scms-server';
import { createMessageRecord, updateMessageStatus } from '../src/backend/email/email-db.server.js';
import { pmcEmailProcessorRegistry } from '../src/backend/email/types.server.js';
import { getEmailProcessorConfig } from '../src/backend/email/registry.server.js';

// Mock all external dependencies
vi.mock('../src/backend/email/registry.server.js', () => ({
  initializeEmailProcessorRegistry: vi.fn(),
  getEmailProcessorConfig: vi.fn(),
}));

vi.mock('../src/backend/email/email-db.server.js', () => ({
  createMessageRecord: vi.fn(),
  updateMessageStatus: vi.fn(),
  updateSubmissionVersionMetadata: vi.fn(),
  updateSubmissionStatusOnReceivingEmail: vi.fn(),
}));

vi.mock('../src/backend/email/types.server.js', () => ({
  pmcEmailProcessorRegistry: {
    identifyProcessor: vi.fn(),
    getHandler: vi.fn(),
    getAllProcessorNames: vi.fn(),
  },
}));

describe('Email Processing Integration Tests', () => {
  let mockContext: Context;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      $config: {
        app: {
          extensions: {
            pmc: {
              inboundEmail: {
                senders: ['nihms-help@ncbi.nlm.nih.gov', 'notifications@nihms.nih.gov'],
              },
            },
          },
        },
      },
      sendSlackNotification: vi.fn().mockResolvedValue(undefined),
      asBaseUrl: vi.fn((path: string) => `https://example.com${path}`),
    } as any;
  });

  describe('Complete Bulk Submission Email Workflow', () => {
    it('should process a successful bulk submission email end-to-end', async () => {
      // Mock successful bulk submission handler
      const mockBulkHandler = {
        type: 'bulk-submission-initial-email',
        name: 'Bulk Submission',
        description: 'Handles NIHMS bulk submission processing result emails',
        identify: vi.fn().mockReturnValue(true),
        validate: vi.fn().mockReturnValue({ isValid: true }),
        process: vi.fn().mockResolvedValue({
          messageId: 'msg-bulk-123',
          status: 'SUCCESS',
          processedDeposits: 2,
          errors: [],
          processor: 'bulk-submission-initial-email',
        }),
      };

      // Setup mocks
      vi.mocked(createMessageRecord).mockResolvedValue('msg-bulk-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(
        'bulk-submission-initial-email',
      );
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockBulkHandler);
      vi.mocked(getEmailProcessorConfig).mockReturnValue({
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });

      // Real bulk submission email payload
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission processing results' },
        plain: 'Package ID=pkg-success-123 for Manuscript ID ms-456789 was processed successfully',
        html: `
          <table>
            <tr>
              <td>SUCCESS</td>
              <td>Package ID=pkg-success-123 for Manuscript ID ms-456789 was processed successfully</td>
            </tr>
            <tr>
              <td>WARNING</td>
              <td>Package ID=pkg-warning-456 for Manuscript ID ms-789012 was submitted with minor issues</td>
            </tr>
          </table>
        `,
      };

      const result = await processInboundEmail(mockContext, payload);

      // Verify final result
      expect(result.messageId).toBe('msg-bulk-123');
      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.processor).toBe('bulk-submission-initial-email');

      // Verify all processing steps were called
      expect(createMessageRecord).toHaveBeenCalledWith(mockContext, payload, null);
      expect(mockBulkHandler.validate).toHaveBeenCalledWith(payload, {
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });
      expect(mockBulkHandler.process).toHaveBeenCalledWith(mockContext, payload, 'msg-bulk-123');
    });

    it('should process a failed bulk submission email end-to-end', async () => {
      // Mock bulk submission handler that processes errors
      const mockBulkHandler = {
        type: 'bulk-submission-initial-email',
        name: 'Bulk Submission',
        description: 'Handles NIHMS bulk submission processing result emails',
        identify: vi.fn().mockReturnValue(true),
        validate: vi.fn().mockReturnValue({ isValid: true }),
        process: vi.fn().mockResolvedValue({
          messageId: 'msg-bulk-error-123',
          status: 'SUCCESS',
          processedDeposits: 1,
          errors: [],
          processor: 'bulk-submission-initial-email',
        }),
      };

      // Setup mocks
      vi.mocked(createMessageRecord).mockResolvedValue('msg-bulk-error-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(
        'bulk-submission-initial-email',
      );
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockBulkHandler);
      vi.mocked(getEmailProcessorConfig).mockReturnValue({
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });

      // Failed bulk submission email payload
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission processing results' },
        plain: 'Package ID=pkg-error-789 failed with validation error: Invalid XML structure',
        html: `
          <table>
            <tr>
              <td>ERROR</td>
              <td>Package ID=pkg-error-789 failed with validation error: Invalid XML structure</td>
            </tr>
          </table>
        `,
      };

      const result = await processInboundEmail(mockContext, payload);

      // Verify final result
      expect(result.messageId).toBe('msg-bulk-error-123');
      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.processor).toBe('bulk-submission-initial-email');

      // Verify processing was called
      expect(mockBulkHandler.process).toHaveBeenCalledWith(
        mockContext,
        payload,
        'msg-bulk-error-123',
      );
    });
  });

  describe('Complete NIHMS Files Request Email Workflow', () => {
    it('should process a NIHMS files request email end-to-end', async () => {
      // Mock NIHMS files request handler
      const mockNIHMSHandler = {
        type: 'nihms-files-request',
        name: 'NIHMS Files Request',
        description: 'Handles NIHMS files request emails',
        identify: vi.fn().mockReturnValue(true),
        validate: vi.fn().mockReturnValue({ isValid: true }),
        process: vi.fn().mockResolvedValue({
          messageId: 'msg-nihms-123',
          status: 'SUCCESS',
          processedDeposits: 1,
          errors: [],
          processor: 'nihms-files-request',
        }),
      };

      // Setup mocks
      vi.mocked(createMessageRecord).mockResolvedValue('msg-nihms-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue('nihms-files-request');
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockNIHMSHandler);
      vi.mocked(getEmailProcessorConfig).mockReturnValue({
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov', 'notifications@nihms.nih.gov'],
        subjectPatterns: ['Please upload.*to NIHMS'],
        enabled: true,
      });

      // Real NIHMS files request email payload
      const payload = {
        envelope: { from: 'notifications@nihms.nih.gov' },
        headers: { subject: 'Please upload additional files to NIHMS' },
        plain: `
External Email: Use Caution

"High-resolution spatial mapping of cell state and lineage dynamics in vivo with PEtracer." (NIHMS2109555)

Dear Howard Hughes Medical Institute,

There are references to Supp. video 1 in the above-listed manuscript; however, the supplementary video was not provided.

Please note that we cannot retrieve supplementary material from sources online, as it must be uploaded at the time of the manuscript submission. Therefore, we have moved the manuscript to a state where you can upload files.

To access the manuscript record, please log in to https://www.nihms.nih.gov/ and click on the manuscript title in the Needs Your Attention filter of your manuscript list.

Thank you,

The NIHMS Team
        `,
        html: '',
      };

      const result = await processInboundEmail(mockContext, payload);

      // Verify final result
      expect(result.messageId).toBe('msg-nihms-123');
      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.processor).toBe('nihms-files-request');

      // Verify all processing steps were called
      expect(mockNIHMSHandler.validate).toHaveBeenCalledWith(payload, {
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov', 'notifications@nihms.nih.gov'],
        subjectPatterns: ['Please upload.*to NIHMS'],
        enabled: true,
      });
      expect(mockNIHMSHandler.process).toHaveBeenCalledWith(mockContext, payload, 'msg-nihms-123');
    });
  });

  describe('Complete Catch-All Email Workflow', () => {
    it('should process an unknown email type with catch-all handler', async () => {
      // Mock catch-all handler
      const mockCatchAllHandler = {
        type: 'catch-all',
        name: 'Catch All',
        description: 'Handles all unknown email types',
        identify: vi.fn().mockReturnValue(true),
        validate: vi.fn().mockReturnValue({ isValid: true }),
        process: vi.fn().mockResolvedValue({
          messageId: 'msg-catchall-123',
          status: 'IGNORED',
          processedDeposits: 0,
          errors: [],
          processor: 'catch-all',
        }),
      };

      // Setup mocks
      vi.mocked(createMessageRecord).mockResolvedValue('msg-catchall-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue('catch-all');
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockCatchAllHandler);
      vi.mocked(getEmailProcessorConfig).mockReturnValue({
        allowedSenders: ['*'],
        subjectPatterns: ['.*'],
        enabled: true,
      });

      // Unknown email type payload with authorized sender
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Random subject' },
        plain: 'This is some random email content that does not match any known patterns.',
        html: '',
      };

      const result = await processInboundEmail(mockContext, payload);

      // Verify final result - catch-all returns IGNORED status
      expect(result.messageId).toBe('msg-catchall-123');
      expect(result.status).toBe('IGNORED');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.processor).toBe('catch-all');

      // Verify all processing steps were called
      expect(mockCatchAllHandler.validate).toHaveBeenCalledWith(payload, {
        allowedSenders: ['*'],
        subjectPatterns: ['.*'],
        enabled: true,
      });
      expect(mockCatchAllHandler.process).toHaveBeenCalledWith(
        mockContext,
        payload,
        'msg-catchall-123',
      );
    });
  });

  describe('Error Scenarios Integration', () => {
    it('should handle unauthorized sender end-to-end', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-unauthorized-123');

      const payload = {
        envelope: { from: 'unauthorized@malicious.com' },
        headers: { subject: 'Malicious email' },
        plain: 'This should be rejected',
        html: '',
      };

      const result = await processInboundEmail(mockContext, payload);

      // Verify rejection
      expect(result.messageId).toBe('msg-unauthorized-123');
      expect(result.status).toBe('BOUNCED');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Sender unauthorized@malicious.com not in allowed list');

      // Verify message was recorded and status updated
      expect(createMessageRecord).toHaveBeenCalledWith(mockContext, payload, {
        validation: {
          isValid: false,
          reason: 'Sender unauthorized@malicious.com not in allowed list',
        },
      });
      expect(updateMessageStatus).toHaveBeenCalledWith(
        mockContext,
        'msg-unauthorized-123',
        'BOUNCED',
        {
          isValid: false,
          reason: 'Sender unauthorized@malicious.com not in allowed list',
        },
      );
    });

    it('should handle email type identification failure end-to-end', async () => {
      vi.mocked(createMessageRecord).mockResolvedValue('msg-unknown-type-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(null);
      vi.mocked(pmcEmailProcessorRegistry.getAllProcessorNames).mockReturnValue([
        'bulk-submission-initial-email',
        'nihms-files-request',
        'catch-all',
      ]);

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Completely unknown email type' },
        plain: 'This email does not match any known patterns',
        html: '',
      };

      const result = await processInboundEmail(mockContext, payload);

      // Verify rejection
      expect(result.messageId).toBe('msg-unknown-type-123');
      expect(result.status).toBe('IGNORED');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('No email type handler found for this email');

      // Verify message was recorded and status updated
      expect(updateMessageStatus).toHaveBeenCalledWith(
        mockContext,
        'msg-unknown-type-123',
        'IGNORED',
        {
          reason: 'No email type handler found',
          availableTypes: ['bulk-submission-initial-email', 'nihms-files-request', 'catch-all'],
        },
      );
    });

    it('should handle validation failure end-to-end', async () => {
      // Mock bulk submission handler that fails validation
      const mockBulkHandler = {
        type: 'bulk-submission-initial-email',
        name: 'Bulk Submission',
        description: 'Handles NIHMS bulk submission processing result emails',
        identify: vi.fn().mockReturnValue(true),
        validate: vi.fn().mockReturnValue({
          isValid: false,
          reason: 'Subject does not match expected patterns',
        }),
        process: vi.fn(),
      };

      vi.mocked(createMessageRecord).mockResolvedValue('msg-validation-fail-123');
      vi.mocked(pmcEmailProcessorRegistry.identifyProcessor).mockReturnValue(
        'bulk-submission-initial-email',
      );
      vi.mocked(pmcEmailProcessorRegistry.getHandler).mockReturnValue(mockBulkHandler);
      vi.mocked(getEmailProcessorConfig).mockReturnValue({
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Wrong subject pattern' },
        plain: 'This should fail validation',
        html: '',
      };

      const result = await processInboundEmail(mockContext, payload);

      // Verify rejection
      expect(result.messageId).toBe('msg-validation-fail-123');
      expect(result.status).toBe('IGNORED');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Subject does not match expected patterns');

      // Verify validation was called but process was not
      expect(mockBulkHandler.validate).toHaveBeenCalledWith(payload, {
        allowedSenders: ['nihms-help@ncbi.nlm.nih.gov'],
        subjectPatterns: ['bulk submission'],
        enabled: true,
      });
      expect(mockBulkHandler.process).not.toHaveBeenCalled();

      // Verify message was recorded and status updated
      expect(updateMessageStatus).toHaveBeenCalledWith(
        mockContext,
        'msg-validation-fail-123',
        'IGNORED',
        {
          isValid: false,
          reason: 'Subject does not match expected patterns',
        },
      );
    });
  });
});
