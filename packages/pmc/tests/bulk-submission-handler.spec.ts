// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  bulkSubmissionHandler,
  bulkSubmissionConfig,
} from '../src/backend/email/handlers/bulk-submission.server.js';
import { parseEmailContent } from '../src/backend/email/handlers/bulk-submission-parser.server.js';
import type { Context } from '@curvenote/scms-core';
import { updateSubmissionMetadataAndStatusIfChanged } from '../src/backend/email/email-db.server.js';

// Mock the email-db.server functions
vi.mock('../src/backend/email/email-db.server.js', () => ({
  updateSubmissionVersionMetadata: vi.fn(),
  updateSubmissionStatusOnReceivingEmail: vi.fn(),
  updateSubmissionMetadataAndStatusIfChanged: vi.fn(),
  getPrismaClient: vi.fn(),
}));

describe('Bulk Submission Handler', () => {
  let mockContext: Context;

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
    } as any;

    // Configure the new helper function mock to return true by default
    vi.mocked(updateSubmissionMetadataAndStatusIfChanged).mockResolvedValue(true);
  });

  describe('Handler Configuration', () => {
    it('should have correct handler properties', () => {
      expect(bulkSubmissionHandler.name).toBe('bulk-submission-initial-email');
      expect(bulkSubmissionHandler.description).toBe(
        'Handles NIHMS bulk submission processing result emails',
      );
    });

    it('should have correct default configuration', () => {
      expect(bulkSubmissionConfig.subjectPatterns).toEqual(['bulk submission']);
      expect(bulkSubmissionConfig.enabled).toBe(true);
    });
  });

  describe('Email Identification', () => {
    it('should identify emails from NIHMS senders with keywords', () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
      };

      const result = bulkSubmissionHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails from NCBI senders with keywords', () => {
      const payload = {
        envelope: { from: 'help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Package processing complete' },
      };

      const result = bulkSubmissionHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails from NLM senders with keywords', () => {
      const payload = {
        envelope: { from: 'support@nlm.nih.gov' },
        headers: { subject: 'Manuscript submission' },
      };

      const result = bulkSubmissionHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails with bulk submission keywords in subject', () => {
      const payload = {
        envelope: { from: 'other@example.com' },
        headers: { subject: 'Bulk submission results' },
      };

      const result = bulkSubmissionHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails with submission keywords in subject', () => {
      const payload = {
        envelope: { from: 'other@example.com' },
        headers: { subject: 'Submission status update' },
      };

      const result = bulkSubmissionHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails with package keywords in subject', () => {
      const payload = {
        envelope: { from: 'other@example.com' },
        headers: { subject: 'Package processing complete' },
      };

      const result = bulkSubmissionHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails with manuscript keywords in subject', () => {
      const payload = {
        envelope: { from: 'other@example.com' },
        headers: { subject: 'Manuscript processing results' },
      };

      const result = bulkSubmissionHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should not identify emails missing required fields', () => {
      const payload = {
        envelope: {},
        headers: { subject: 'Some subject' },
      };

      const result = bulkSubmissionHandler.identify(payload);
      expect(result).toBe(false);
    });

    it('should not identify emails from unrelated senders without keywords', () => {
      const payload = {
        envelope: { from: 'other@example.com' },
        headers: { subject: 'Random email' },
      };

      const result = bulkSubmissionHandler.identify(payload);
      expect(result).toBe(false);
    });
  });

  describe('Email Validation', () => {
    it('should validate emails from allowed senders', () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
      };

      const result = bulkSubmissionHandler.validate(payload, bulkSubmissionConfig);
      expect(result.isValid).toBe(true);
    });

    it('should reject emails missing subject', () => {
      const payload = {
        headers: {},
      };

      const result = bulkSubmissionHandler.validate(payload, bulkSubmissionConfig);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Missing subject');
    });

    it('should reject emails with subjects not matching patterns', () => {
      const payload = {
        headers: { subject: 'Random email subject' },
      };

      const result = bulkSubmissionHandler.validate(payload, bulkSubmissionConfig);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('does not match expected patterns');
    });
  });

  describe('Email Parsing', () => {
    it('should parse plain text email content', () => {
      const payload = {
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=12345 for Manuscript ID 67890 was submitted successfully',
        html: '',
      };

      const result = parseEmailContent(payload.plain, payload.html);
      expect(result.type).toBe('success');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].packageId).toBe('12345');
      expect(result.packages[0].manuscriptId).toBe('67890');
      expect(result.packages[0].status).toBe('success');
    });

    it('should parse HTML email content', () => {
      const payload = {
        headers: { subject: 'Bulk submission results' },
        plain: '',
        html: `
          <table>
            <tr>
              <td>ERROR</td>
              <td>Package ID=12345 failed with validation error</td>
            </tr>
          </table>
        `,
      };

      const result = parseEmailContent(payload.plain, payload.html);
      expect(result.type).toBe('error');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].packageId).toBe('12345');
      expect(result.packages[0].status).toBe('error');
    });

    it('should prefer HTML over plain text when both are available', () => {
      const payload = {
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=plain123 for Manuscript ID 456 was submitted',
        html: `
          <table>
            <tr>
              <td>WARNING</td>
              <td>Package ID=html789 for Manuscript ID 012 has issues</td>
            </tr>
          </table>
        `,
      };

      const result = parseEmailContent(payload.plain, payload.html);
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].packageId).toBe('html789'); // Should use HTML, not plain text
      expect(result.packages[0].manuscriptId).toBe('012');
      expect(result.packages[0].status).toBe('warning');
    });

    it('should fall back to plain text when HTML is empty', () => {
      const payload = {
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=fallback123 for Manuscript ID 456 was submitted',
        html: '',
      };

      const result = parseEmailContent(payload.plain, payload.html);
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].packageId).toBe('fallback123');
      expect(result.packages[0].manuscriptId).toBe('456');
    });

    it('should handle multiple packages in HTML table', () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: '',
        html: `
          <table>
            <tr>
              <td>SUCCESS</td>
              <td>Package ID=success123 for Manuscript ID 111 was processed</td>
            </tr>
            <tr>
              <td>WARNING</td>
              <td>Package ID=warning456 for Manuscript ID 222 has issues</td>
            </tr>
            <tr>
              <td>ERROR</td>
              <td>Package ID=error789 for Manuscript ID 333 failed</td>
            </tr>
          </table>
        `,
      };

      const result = parseEmailContent(payload.plain, payload.html);
      expect(result.packages).toHaveLength(3);
      expect(result.packages[0].packageId).toBe('success123');
      expect(result.packages[0].status).toBe('success');
      expect(result.packages[1].packageId).toBe('warning456');
      expect(result.packages[1].status).toBe('warning');
      expect(result.packages[2].packageId).toBe('error789');
      expect(result.packages[2].status).toBe('error');
    });
  });

  describe('Email Processing', () => {
    it('should process successful package results', async () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=success123 for Manuscript ID 456 was submitted successfully',
        html: '',
      };

      const result = await bulkSubmissionHandler.process(mockContext, payload, 'msg-123');

      expect(result.messageId).toBe('msg-123');
      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.processor).toBe('bulk-submission-initial-email');

      expect(updateSubmissionMetadataAndStatusIfChanged).toHaveBeenCalledWith(
        mockContext,
        'success123',
        expect.objectContaining({
          packageId: 'success123',
          manuscriptId: '456',
          status: 'success',
        }),
        'msg-123',
        'DEPOSIT_CONFIRMED_BY_PMC',
        'bulk-submission-initial-email',
      );
    });

    it('should process warning package results as confirmed', async () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=warning123 for Manuscript ID 456 was submitted with warnings',
        html: '',
      };

      const result = await bulkSubmissionHandler.process(mockContext, payload, 'msg-456');

      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(1);

      expect(updateSubmissionMetadataAndStatusIfChanged).toHaveBeenCalledWith(
        mockContext,
        'warning123',
        expect.objectContaining({
          status: 'warning',
        }),
        'msg-456',
        'DEPOSIT_CONFIRMED_BY_PMC', // Warnings are treated as confirmed
        'bulk-submission-initial-email',
      );
    });

    it('should process error package results as rejected', async () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=error123 failed with validation error',
        html: '',
      };

      const result = await bulkSubmissionHandler.process(mockContext, payload, 'msg-789');

      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(1);

      expect(updateSubmissionMetadataAndStatusIfChanged).toHaveBeenCalledWith(
        mockContext,
        'error123',
        expect.objectContaining({
          status: 'error',
        }),
        'msg-789',
        'DEPOSIT_REJECTED_BY_PMC', // Errors are treated as rejected
        'bulk-submission-initial-email',
      );
    });

    it('should process "direct submission only" error via DEPOSIT_REJECTED_BY_PMC then NO_ACTION_NEEDED', async () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission (errors encountered)' },
        plain: '',
        html: `
          <table>
            <tr>
              <td>ERROR</td>
              <td>Package ID=019bbe52-ff29-7d6b-b9c1-bd0824127826 failed because all manuscripts from this journal should be submitted directly to PMC.</td>
            </tr>
          </table>
        `,
      };

      const result = await bulkSubmissionHandler.process(mockContext, payload, 'msg-direct');

      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(1);
      expect(updateSubmissionMetadataAndStatusIfChanged).toHaveBeenCalledTimes(2);
      expect(updateSubmissionMetadataAndStatusIfChanged).toHaveBeenNthCalledWith(
        1,
        mockContext,
        '019bbe52-ff29-7d6b-b9c1-bd0824127826',
        expect.objectContaining({
          status: 'error',
          packageId: '019bbe52-ff29-7d6b-b9c1-bd0824127826',
        }),
        'msg-direct',
        'DEPOSIT_REJECTED_BY_PMC',
        'bulk-submission-initial-email',
      );
      expect(updateSubmissionMetadataAndStatusIfChanged).toHaveBeenNthCalledWith(
        2,
        mockContext,
        '019bbe52-ff29-7d6b-b9c1-bd0824127826',
        expect.objectContaining({
          status: 'error',
          packageId: '019bbe52-ff29-7d6b-b9c1-bd0824127826',
        }),
        'msg-direct',
        'NO_ACTION_NEEDED',
        'bulk-submission-initial-email',
      );
    });

    it('should handle multiple packages in single email', async () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: '',
        html: `
          <table>
            <tr>
              <td>SUCCESS</td>
              <td>Package ID=success123 for Manuscript ID 111 was processed</td>
            </tr>
            <tr>
              <td>ERROR</td>
              <td>Package ID=error456 for Manuscript ID 222 failed</td>
            </tr>
          </table>
        `,
      };

      const result = await bulkSubmissionHandler.process(mockContext, payload, 'msg-multi');

      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(2);

      expect(updateSubmissionMetadataAndStatusIfChanged).toHaveBeenCalledTimes(2);
    });

    it('should handle processing errors gracefully', async () => {
      // Mock updateSubmissionMetadataAndStatusIfChanged to throw an error
      vi.mocked(updateSubmissionMetadataAndStatusIfChanged).mockRejectedValueOnce(
        new Error('Database error'),
      );

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=error123 failed with validation error',
        html: '',
      };

      const result = await bulkSubmissionHandler.process(mockContext, payload, 'msg-error');

      expect(result.status).toBe('ERROR');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Package error123: Database error');
    });

    it('should handle partial processing success', async () => {
      // Mock first call to succeed, second to fail
      vi.mocked(updateSubmissionMetadataAndStatusIfChanged)
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Database error'));

      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: '',
        html: `
          <table>
            <tr>
              <td>SUCCESS</td>
              <td>Package ID=success123 for Manuscript ID 111 was processed</td>
            </tr>
            <tr>
              <td>ERROR</td>
              <td>Package ID=error456 for Manuscript ID 222 failed</td>
            </tr>
          </table>
        `,
      };

      const result = await bulkSubmissionHandler.process(mockContext, payload, 'msg-partial');

      expect(result.status).toBe('PARTIAL');
      expect(result.processedDeposits).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Package error456: Database error');
    });
  });

  describe('Error Handling', () => {
    it('should handle processing exceptions', async () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk submission results' },
        plain: 'Package ID=test123 for Manuscript ID 456 was submitted',
        html: '',
      };

      // Mock an unexpected error during processing
      vi.mocked(updateSubmissionMetadataAndStatusIfChanged).mockImplementation(() => {
        throw new Error('Unexpected database error');
      });

      const result = await bulkSubmissionHandler.process(mockContext, payload, 'msg-exception');

      expect(result.status).toBe('ERROR');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Unexpected database error');
    });
  });
});
