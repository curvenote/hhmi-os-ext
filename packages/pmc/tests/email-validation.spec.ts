// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateEmailSender,
  validateEmailSubject,
  validateDKIM,
  validateEmail,
} from '../src/backend/email/email-validation.server.js';

describe('Email Validation - Sender Validation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('validateEmailSender', () => {
    describe('Basic string matching (exact match)', () => {
      it('should accept exact match (case insensitive)', () => {
        const envelope = { from: 'nihms-help@ncbi.nlm.nih.gov' };
        const allowedSenders = ['nihms-help@ncbi.nlm.nih.gov'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });

      it('should accept exact match with different case', () => {
        const envelope = { from: 'NIHMS-HELP@NCBI.NLM.NIH.GOV' };
        const allowedSenders = ['nihms-help@ncbi.nlm.nih.gov'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });

      it('should reject non-matching sender', () => {
        const envelope = { from: 'unauthorized@example.com' };
        const allowedSenders = ['nihms-help@ncbi.nlm.nih.gov'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(false);
        expect(result.reason).toContain('not in allowed list');
      });

      it('should reject when sender is missing', () => {
        const envelope = {};
        const allowedSenders = ['nihms-help@ncbi.nlm.nih.gov'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Missing sender information');
      });

      it('should accept when sender matches one of multiple allowed senders', () => {
        const envelope = { from: 'notifications@nihms.nih.gov' };
        const allowedSenders = [
          'nihms-help@ncbi.nlm.nih.gov',
          'notifications@nihms.nih.gov',
          'admin@example.com',
        ];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });
    });

    describe('Regex pattern matching', () => {
      it('should accept sender matching regex pattern with plus addressing', () => {
        const envelope = {
          from: 'hhmi-pmc-deposit+bncBCU75WMZWEMBB55STHDQMGQEG3RDW6I@curvenote.com',
        };
        const allowedSenders = ['/hhmi-pmc-deposit\\+.*@curvenote\\.com/'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });

      it('should accept sender matching regex pattern (case insensitive)', () => {
        const envelope = { from: 'HHMI-PMC-DEPOSIT+TEST123@CURVENOTE.COM' };
        const allowedSenders = ['/hhmi-pmc-deposit\\+.*@curvenote\\.com/'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });

      it('should reject sender not matching regex pattern', () => {
        const envelope = { from: 'hhmi-pmc-deposit@curvenote.com' }; // missing the + part
        const allowedSenders = ['/hhmi-pmc-deposit\\+.*@curvenote\\.com/'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(false);
        expect(result.reason).toContain('not in allowed list');
      });

      it('should accept sender matching domain wildcard regex', () => {
        const envelope = { from: 'any-user@ncbi.nlm.nih.gov' };
        const allowedSenders = ['/.*@ncbi\\.nlm\\.nih\\.gov/'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });

      it('should accept sender matching prefix wildcard regex', () => {
        const envelope = { from: 'nihms-notifications-12345@example.com' };
        const allowedSenders = ['/nihms-.*@example\\.com/'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });

      it('should handle multiple regex patterns', () => {
        const envelope = { from: 'hhmi-pmc-deposit+test@curvenote.com' };
        const allowedSenders = [
          '/nihms-.*@ncbi\\.nlm\\.nih\\.gov/',
          '/hhmi-pmc-deposit\\+.*@curvenote\\.com/',
          '/notifications@.*\\.gov/',
        ];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });

      it('should handle mix of exact and regex patterns', () => {
        const envelope = { from: 'hhmi-pmc-deposit+abc123@curvenote.com' };
        const allowedSenders = [
          'nihms-help@ncbi.nlm.nih.gov', // exact match
          '/hhmi-pmc-deposit\\+.*@curvenote\\.com/', // regex
          'admin@example.com', // exact match
        ];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });

      it('should handle invalid regex pattern gracefully', () => {
        const envelope = { from: 'test@example.com' };
        const allowedSenders = ['/[invalid(regex/'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(false);
        expect(result.reason).toContain('not in allowed list');
      });

      it('should not treat regex special chars as regex when not wrapped in slashes', () => {
        const envelope = { from: 'test+tag@example.com' };
        const allowedSenders = ['test+tag@example.com']; // NOT a regex, just exact match

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });

      it('should not treat partial regex patterns as regex (missing ending slash)', () => {
        const envelope = { from: 'test@example.com' };
        const allowedSenders = ['/test@example.com']; // Missing ending slash

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(false);
        expect(result.reason).toContain('not in allowed list');
      });

      it('should not treat partial regex patterns as regex (missing starting slash)', () => {
        const envelope = { from: 'test@example.com' };
        const allowedSenders = ['test@example.com/']; // Missing starting slash

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(false);
        expect(result.reason).toContain('not in allowed list');
      });

      it('should handle empty regex pattern (//)', () => {
        const envelope = { from: 'test@example.com' };
        const allowedSenders = ['//']; // Empty regex

        const result = validateEmailSender(envelope, allowedSenders);

        // Empty regex should not match anything meaningful
        expect(result.isValid).toBe(false);
      });
    });

    describe('Real-world scenarios from configuration', () => {
      it('should accept all configured senders from .app-config.development.yml', () => {
        const allowedSenders = [
          'steve@curvenote.com',
          'franklin@curvenote.com',
          'rowan@curvenote.com',
          'hhmi-pmc-deposit@curvenote.com',
          '/hhmi-pmc-deposit\\+.*@curvenote\\.com/',
          'pmc-deposit@hhmi.org',
        ];

        // Test exact matches
        expect(validateEmailSender({ from: 'steve@curvenote.com' }, allowedSenders).isValid).toBe(
          true,
        );
        expect(
          validateEmailSender({ from: 'franklin@curvenote.com' }, allowedSenders).isValid,
        ).toBe(true);
        expect(validateEmailSender({ from: 'rowan@curvenote.com' }, allowedSenders).isValid).toBe(
          true,
        );
        expect(
          validateEmailSender({ from: 'hhmi-pmc-deposit@curvenote.com' }, allowedSenders).isValid,
        ).toBe(true);
        expect(validateEmailSender({ from: 'pmc-deposit@hhmi.org' }, allowedSenders).isValid).toBe(
          true,
        );

        // Test regex pattern with plus addressing (the reported bug case)
        expect(
          validateEmailSender(
            { from: 'hhmi-pmc-deposit+bncBCU75WMZWEMBB55STHDQMGQEG3RDW6I@curvenote.com' },
            allowedSenders,
          ).isValid,
        ).toBe(true);

        // Test regex pattern with different tags
        expect(
          validateEmailSender({ from: 'hhmi-pmc-deposit+test123@curvenote.com' }, allowedSenders)
            .isValid,
        ).toBe(true);

        // Test that non-matching senders are rejected
        expect(
          validateEmailSender({ from: 'unauthorized@example.com' }, allowedSenders).isValid,
        ).toBe(false);
      });

      it('should reject sender without plus tag when regex requires it', () => {
        const allowedSenders = ['/hhmi-pmc-deposit\\+.*@curvenote\\.com/'];

        const result = validateEmailSender(
          { from: 'hhmi-pmc-deposit@curvenote.com' }, // Missing + tag
          allowedSenders,
        );

        expect(result.isValid).toBe(false);
      });

      it('should accept base address via literal match even when regex requires plus tag', () => {
        // This test explicitly verifies that when BOTH literal and regex are present,
        // the base address (without +) passes via literal match
        const allowedSenders = [
          'hhmi-pmc-deposit@curvenote.com', // Literal match for base address
          '/hhmi-pmc-deposit\\+.*@curvenote\\.com/', // Regex match for plus-addressed variants
        ];

        // Base address should pass via literal match (first rule)
        expect(
          validateEmailSender({ from: 'hhmi-pmc-deposit@curvenote.com' }, allowedSenders).isValid,
        ).toBe(true);

        // Plus-addressed variants should pass via regex match (second rule)
        expect(
          validateEmailSender({ from: 'hhmi-pmc-deposit+test123@curvenote.com' }, allowedSenders)
            .isValid,
        ).toBe(true);

        expect(
          validateEmailSender(
            { from: 'hhmi-pmc-deposit+bncBCU75WMZWEMBB55STHDQMGQEG3RDW6I@curvenote.com' },
            allowedSenders,
          ).isValid,
        ).toBe(true);

        // Related but different addresses should be rejected
        expect(
          validateEmailSender({ from: 'hhmi-pmc-other@curvenote.com' }, allowedSenders).isValid,
        ).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle whitespace in sender email', () => {
        const envelope = { from: '  test@example.com  ' };
        const allowedSenders = ['test@example.com'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(true);
      });

      it('should handle empty allowed senders list', () => {
        const envelope = { from: 'test@example.com' };
        const allowedSenders: string[] = [];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(false);
      });

      it('should handle null envelope', () => {
        const envelope = null as any;
        const allowedSenders = ['test@example.com'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Missing sender information');
      });

      it('should handle undefined envelope', () => {
        const envelope = undefined as any;
        const allowedSenders = ['test@example.com'];

        const result = validateEmailSender(envelope, allowedSenders);

        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Missing sender information');
      });
    });
  });

  describe('validateEmailSubject', () => {
    it('should accept subject containing "bulk submission"', () => {
      const headers = { subject: 'NIHMS Bulk Submission Results' };

      const result = validateEmailSubject(headers);

      expect(result.isValid).toBe(true);
    });

    it('should accept forwarded subject with "bulk submission"', () => {
      const headers = { subject: 'Fwd: Bulk Submission Processing Complete' };

      const result = validateEmailSubject(headers);

      expect(result.isValid).toBe(true);
    });

    it('should accept subject with "bulk submission" anywhere (case insensitive)', () => {
      const headers = { subject: 'Re: Your BULK SUBMISSION was processed' };

      const result = validateEmailSubject(headers);

      expect(result.isValid).toBe(true);
    });

    it('should reject subject without "bulk submission"', () => {
      const headers = { subject: 'Random email subject' };

      const result = validateEmailSubject(headers);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('does not match expected pattern');
    });

    it('should reject when subject is missing', () => {
      const headers = {};

      const result = validateEmailSubject(headers);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Missing subject');
    });
  });

  describe('validateDKIM', () => {
    it('should always return valid (placeholder implementation)', () => {
      const result = validateDKIM();

      expect(result.isValid).toBe(true);
    });
  });

  describe('validateEmail - Comprehensive validation', () => {
    it('should validate email with all checks passing', () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Bulk Submission Results' },
      };
      const allowedSenders = ['nihms-help@ncbi.nlm.nih.gov'];

      const result = validateEmail(payload, allowedSenders);

      expect(result.isValid).toBe(true);
    });

    it('should reject email with invalid sender', () => {
      const payload = {
        envelope: { from: 'unauthorized@example.com' },
        headers: { subject: 'Bulk Submission Results' },
      };
      const allowedSenders = ['nihms-help@ncbi.nlm.nih.gov'];

      const result = validateEmail(payload, allowedSenders);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('not in allowed list');
    });

    it('should reject email with invalid subject', () => {
      const payload = {
        envelope: { from: 'nihms-help@ncbi.nlm.nih.gov' },
        headers: { subject: 'Random subject' },
      };
      const allowedSenders = ['nihms-help@ncbi.nlm.nih.gov'];

      const result = validateEmail(payload, allowedSenders);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('does not match expected pattern');
    });

    it('should validate email with regex sender pattern', () => {
      const payload = {
        envelope: { from: 'hhmi-pmc-deposit+test123@curvenote.com' },
        headers: { subject: 'Bulk Submission Results' },
      };
      const allowedSenders = ['/hhmi-pmc-deposit\\+.*@curvenote\\.com/'];

      const result = validateEmail(payload, allowedSenders);

      expect(result.isValid).toBe(true);
    });
  });
});
