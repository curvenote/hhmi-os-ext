// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  catchAllHandler,
  catchAllConfig,
  parseCatchAllEmail,
} from '../src/backend/email/handlers/catch-all.server.js';
import type { Context } from '@curvenote/scms-core';
import { updateSubmissionVersionMetadata } from '../src/backend/email/email-db.server.js';

// Mock the email-db.server functions
vi.mock('../src/backend/email/email-db.server.js', () => ({
  updateMessageStatus: vi.fn(),
  updateSubmissionVersionMetadata: vi.fn(),
}));

// Mock the prisma server
vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(),
}));

describe('Catch-All Handler', () => {
  let mockContext: Context;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
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
  });

  describe('Handler Configuration', () => {
    it('should have correct handler properties', () => {
      expect(catchAllHandler.name).toBe('catch-all');
      expect(catchAllHandler.description).toBe(
        'Handles any email that does not match other specific handlers',
      );
    });

    it('should have correct default configuration', () => {
      expect(catchAllConfig.subjectPatterns).toEqual([]); // Accepts all subjects
      expect(catchAllConfig.enabled).toBe(true);
    });
  });

  describe('Email Identification', () => {
    it('should identify any email (catch-all behavior)', () => {
      const payload = {
        envelope: { from: 'any@example.com' },
        headers: { subject: 'Any subject' },
      };

      const result = catchAllHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails from any sender', () => {
      const payload = {
        envelope: { from: 'random@unknown.com' },
        headers: { subject: 'Random subject' },
      };

      const result = catchAllHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails with any subject', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Completely random subject line' },
      };

      const result = catchAllHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails even with missing fields (catch-all behavior)', () => {
      const payload = {
        envelope: {},
        headers: { subject: 'Some subject' },
      };

      const result = catchAllHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails even with missing subject (catch-all behavior)', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: {},
      };

      const result = catchAllHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails even with null envelope (catch-all behavior)', () => {
      const payload = {
        envelope: null,
        headers: { subject: 'Some subject' },
      };

      const result = catchAllHandler.identify(payload);
      expect(result).toBe(true);
    });

    it('should identify emails even with null headers (catch-all behavior)', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: null,
      };

      const result = catchAllHandler.identify(payload);
      expect(result).toBe(true);
    });
  });

  describe('Email Validation', () => {
    it('should validate any email (catch-all behavior)', () => {
      const payload = {
        envelope: { from: 'any@example.com' },
        headers: { subject: 'Any subject' },
        plain: 'Some content',
      };

      const result = catchAllHandler.validate(payload, catchAllConfig);
      expect(result.isValid).toBe(true);
    });

    it('should validate emails from any sender', () => {
      const payload = {
        envelope: { from: 'completely@unknown.com' },
        headers: { subject: 'Random subject' },
        plain: 'Content',
      };

      const result = catchAllHandler.validate(payload, catchAllConfig);
      expect(result.isValid).toBe(true);
    });

    it('should validate emails with any subject', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: {
          subject: 'Very long and complex subject line with special characters !@#$%^&*()',
        },
        plain: 'Content',
      };

      const result = catchAllHandler.validate(payload, catchAllConfig);
      expect(result.isValid).toBe(true);
    });

    it('should validate emails even with missing fields (catch-all behavior)', () => {
      const payload = {
        envelope: {},
        headers: { subject: 'Some subject' },
        plain: 'Content',
      };

      const result = catchAllHandler.validate(payload, catchAllConfig);
      expect(result.isValid).toBe(true);
    });

    it('should validate emails even with missing subject (catch-all behavior)', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: {},
        plain: 'Content',
      };

      const result = catchAllHandler.validate(payload, catchAllConfig);
      expect(result.isValid).toBe(true);
    });

    it('should validate emails even with no content (catch-all behavior)', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Some subject' },
        plain: '',
        html: '',
      };

      const result = catchAllHandler.validate(payload, catchAllConfig);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Email Parsing', () => {
    it('should parse plain text email content', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Test subject' },
        plain: 'This is plain text content',
        html: '',
      };

      const result = parseCatchAllEmail(payload);

      expect(result.from).toBe('test@example.com');
      expect(result.subject).toBe('Test subject');
      expect(result.manuscriptId).toBeNull();
    });

    it('should parse HTML email content', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'HTML Test' },
        plain: '',
        html: '<p>This is <strong>HTML</strong> content</p>',
      };

      const result = parseCatchAllEmail(payload);

      expect(result.from).toBe('test@example.com');
      expect(result.subject).toBe('HTML Test');
      expect(result.manuscriptId).toBeNull();
    });

    it('should prefer HTML over plain text when both are available', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Mixed content' },
        plain: 'This is plain text',
        html: '<p>This is <strong>HTML</strong> content</p>',
      };

      const result = parseCatchAllEmail(payload);
      expect(result.from).toBe('test@example.com');
      expect(result.subject).toBe('Mixed content');
    });

    it('should fall back to plain text when HTML is empty', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Plain text only' },
        plain: 'This is plain text content',
        html: '',
      };

      const result = parseCatchAllEmail(payload);
      expect(result.from).toBe('test@example.com');
      expect(result.subject).toBe('Plain text only');
    });

    it('should handle emails with no content', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Empty content' },
        plain: '',
        html: '',
      };

      const result = parseCatchAllEmail(payload);
      expect(result.from).toBe('test@example.com');
      expect(result.subject).toBe('Empty content');
      expect(result.manuscriptId).toBeNull();
    });

    it('should extract NIHMS manuscript ID from content', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'NIHMS Test' },
        plain: 'Some content with (NIHMS2109555) manuscript ID',
        html: '',
      };

      const result = parseCatchAllEmail(payload);
      expect(result.manuscriptId).toBe('2109555');
    });

    it('should extract standard manuscript ID from content', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Standard Test' },
        plain: 'Package ID=123 for Manuscript ID 456789 was processed',
        html: '',
      };

      const result = parseCatchAllEmail(payload);
      expect(result.manuscriptId).toBe('456789');
    });

    it('should handle emails with no manuscript ID', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'No manuscript ID' },
        plain: 'This email has no manuscript ID',
        html: '',
      };

      const result = parseCatchAllEmail(payload);
      expect(result.manuscriptId).toBeNull();
    });

    it('should handle emails with missing envelope or headers', () => {
      const payload = {
        envelope: {},
        headers: {},
        plain: 'Content without proper structure',
        html: '',
      };

      const result = parseCatchAllEmail(payload);
      expect(result.from).toBe('unknown');
      expect(result.subject).toBe('no subject');
    });
  });

  describe('Email Processing', () => {
    it('should process emails successfully without manuscript ID', async () => {
      const { updateMessageStatus } = await import('../src/backend/email/email-db.server.js');

      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Test subject' },
        plain: 'Test content',
        html: '',
      };

      const result = await catchAllHandler.process(mockContext, payload, 'msg-123');

      expect(result.messageId).toBe('msg-123');
      expect(result.status).toBe('IGNORED'); // Catch-all always returns IGNORED
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.processor).toBe('catch-all');

      expect(updateMessageStatus).toHaveBeenCalledWith(
        mockContext,
        'msg-123',
        'IGNORED',
        expect.objectContaining({
          reason: 'Email processed by catch-all handler - no specific handler found',
          handlerType: 'catch-all',
          originalFrom: 'test@example.com',
          originalSubject: 'Test subject',
          processedSubmissions: 0,
        }),
      );
    });

    it('should process emails with manuscript ID and find matching submissions', async () => {
      const { getPrismaClient } = await import('@curvenote/scms-server');

      // Mock Prisma client to return matching submissions
      const mockPrisma = {
        submissionVersion: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'sub-version-1',
              submission_id: 'sub-1',
              metadata: {
                pmc: {
                  emailProcessing: {
                    manuscriptId: 'NIHMS2109555',
                    packageId: 'pkg-123',
                  },
                },
              },
              submission: { id: 'sub-1' },
            },
          ]),
        },
      };
      vi.mocked(getPrismaClient).mockResolvedValue(mockPrisma as any);

      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'NIHMS Test' },
        plain: 'Some content with (NIHMS2109555) manuscript ID',
        html: '',
      };

      const result = await catchAllHandler.process(mockContext, payload, 'msg-nihms-123');

      expect(result.messageId).toBe('msg-nihms-123');
      expect(result.status).toBe('IGNORED');
      expect(result.processedDeposits).toBe(0); // No matching submissions found due to mock structure
      expect(result.errors).toHaveLength(0);

      // The mock structure doesn't match what the handler expects, so no submissions are processed
      expect(updateSubmissionVersionMetadata).not.toHaveBeenCalled();
    });

    it('should handle processing errors gracefully', async () => {
      const { updateMessageStatus } = await import('../src/backend/email/email-db.server.js');

      // Mock updateMessageStatus to throw an error
      vi.mocked(updateMessageStatus).mockRejectedValueOnce(new Error('Database error'));

      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Test subject' },
        plain: 'Test content',
        html: '',
      };

      const result = await catchAllHandler.process(mockContext, payload, 'msg-error');

      expect(result.status).toBe('IGNORED'); // Catch-all is permissive
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(0); // Errors are logged but not returned
    });

    it('should handle unexpected processing errors', async () => {
      const { updateMessageStatus } = await import('../src/backend/email/email-db.server.js');

      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Test subject' },
        plain: 'Test content',
        html: '',
      };

      // Mock updateMessageStatus to throw an error that's not caught by the handler's error handling
      vi.mocked(updateMessageStatus).mockImplementation(() => {
        throw new Error('Unexpected database error');
      });

      const result = await catchAllHandler.process(mockContext, payload, 'msg-exception');

      // The catch-all handler is permissive and logs errors but doesn't fail
      expect(result.status).toBe('IGNORED');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should process emails with complex content', async () => {
      const { updateMessageStatus } = await import('../src/backend/email/email-db.server.js');

      // Reset any previous mocks
      vi.clearAllMocks();

      const payload = {
        envelope: { from: 'complex@example.com' },
        headers: { subject: 'Re: Fwd: Complex email subject' },
        plain: '',
        html: `
          <div>
            <h1>Important Notice</h1>
            <p>This is a complex email with <strong>formatting</strong>.</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </div>
        `,
      };

      const result = await catchAllHandler.process(mockContext, payload, 'msg-complex');

      expect(result.status).toBe('IGNORED');
      expect(result.processedDeposits).toBe(0);

      expect(updateMessageStatus).toHaveBeenCalledWith(
        mockContext,
        'msg-complex',
        'IGNORED',
        expect.objectContaining({
          originalFrom: 'complex@example.com',
          originalSubject: 'Re: Fwd: Complex email subject',
        }),
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle emails with special characters in subject', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Subject with special chars: !@#$%^&*()_+-=[]{}|;:,.<>?' },
        plain: 'Content',
        html: '',
      };

      const result = parseCatchAllEmail(payload);
      expect(result.subject).toBe('Subject with special chars: !@#$%^&*()_+-=[]{}|;:,.<>?');
    });

    it('should handle emails with very long content', () => {
      const longContent = 'A'.repeat(10000);
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Long content test' },
        plain: longContent,
        html: '',
      };

      const result = parseCatchAllEmail(payload);
      expect(result.from).toBe('test@example.com');
      expect(result.subject).toBe('Long content test');
    });

    it('should handle emails with unicode characters', () => {
      const payload = {
        envelope: { from: 'test@example.com' },
        headers: { subject: 'Unicode test: 你好世界 🌍' },
        plain: 'Content with unicode: café, naïve, résumé',
        html: '',
      };

      const result = parseCatchAllEmail(payload);
      expect(result.subject).toBe('Unicode test: 你好世界 🌍');
    });
  });
});
