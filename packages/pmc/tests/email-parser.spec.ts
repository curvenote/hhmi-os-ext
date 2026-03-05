// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import {
  extractPackageId,
  determineMessageType,
  extractMessage,
  parseHTMLTableRows,
  parseEmailContent,
  isDirectSubmissionOnlyError,
} from '../src/backend/email/handlers/bulk-submission-parser.server.js';
import { extractManuscriptId } from '../src/backend/email/handlers/email-parsing-utils.server.js';
import { validateEmailSubject } from '../src/backend/email/email-validation.server.js';

describe('email-parser', () => {
  describe('extractPackageId', () => {
    it('should extract package ID with equals sign', () => {
      const text = 'Package ID=621b52177f5f8 failed because of the following meta XML';
      expect(extractPackageId(text)).toBe('621b52177f5f8');
    });

    it('should extract package ID with space', () => {
      const text = 'Package ID 191e0b4fc0b was not submitted because';
      expect(extractPackageId(text)).toBe('191e0b4fc0b');
    });

    it('should extract package ID with tabs', () => {
      const text = 'Package\tID=621b52177f5f8\tfailed because of the following meta XML';
      expect(extractPackageId(text)).toBe('621b52177f5f8');
    });

    it('should extract package ID with newlines', () => {
      const text = 'Package\nID=621b52177f5f8\nfailed because of the following meta XML';
      expect(extractPackageId(text)).toBe('621b52177f5f8');
    });

    it('should extract package ID with carriage returns', () => {
      const text = 'Package\rID=621b52177f5f8\rfailed because of the following meta XML';
      expect(extractPackageId(text)).toBe('621b52177f5f8');
    });

    it('should extract package ID with mixed whitespace', () => {
      const text = 'Package\t\n\rID=621b52177f5f8\t\n\rfailed because of the following meta XML';
      expect(extractPackageId(text)).toBe('621b52177f5f8');
    });

    it('should return null when no package ID found', () => {
      const text = 'This is some random text without a package ID';
      expect(extractPackageId(text)).toBeNull();
    });

    it('should handle case insensitive matching', () => {
      const text = 'package id=ABC123 failed';
      expect(extractPackageId(text)).toBe('ABC123');
    });
  });

  describe('isDirectSubmissionOnlyError', () => {
    it('should return true when message contains "should be submitted directly to PMC"', () => {
      const message =
        'Package ID=019bbe52-ff29-7d6b-b9c1-bd0824127826 failed because all manuscripts from this journal should be submitted directly to PMC.';
      expect(isDirectSubmissionOnlyError(message)).toBe(true);
    });

    it('should return true for case-insensitive match', () => {
      expect(isDirectSubmissionOnlyError('Should be submitted directly to PMC')).toBe(true);
      expect(isDirectSubmissionOnlyError('SHOULD BE SUBMITTED DIRECTLY TO PMC')).toBe(true);
    });

    it('should return false when message does not contain the phrase', () => {
      expect(isDirectSubmissionOnlyError('Package ID=abc failed with validation error')).toBe(
        false,
      );
      expect(isDirectSubmissionOnlyError('submitted to PMC')).toBe(false);
    });

    it('should return false for undefined or empty message', () => {
      expect(isDirectSubmissionOnlyError(undefined)).toBe(false);
      expect(isDirectSubmissionOnlyError('')).toBe(false);
    });
  });

  describe('extractManuscriptId', () => {
    it('should extract manuscript ID with "Manuscript ID"', () => {
      const text = 'Package ID=191e5fc4eea for Manuscript ID 1502493 was submitted';
      expect(extractManuscriptId(text)).toBe('1502493');
    });

    it('should extract manuscript ID with "for Manuscript ID"', () => {
      const text = 'Warning: Package ID=191e5fc4eea for Manuscript ID 1502493 was submitted';
      expect(extractManuscriptId(text)).toBe('1502493');
    });

    it('should extract manuscript ID with tabs', () => {
      const text = 'Package ID=191e5fc4eea\tfor\tManuscript\tID\t1502493\twas submitted';
      expect(extractManuscriptId(text)).toBe('1502493');
    });

    it('should extract manuscript ID with newlines', () => {
      const text = 'Package ID=191e5fc4eea\nfor\nManuscript\nID\n1502493\nwas submitted';
      expect(extractManuscriptId(text)).toBe('1502493');
    });

    it('should extract manuscript ID with carriage returns', () => {
      const text = 'Package ID=191e5fc4eea\rfor\rManuscript\rID\r1502493\rwas submitted';
      expect(extractManuscriptId(text)).toBe('1502493');
    });

    it('should extract manuscript ID with mixed whitespace', () => {
      const text =
        'Package ID=191e5fc4eea\t\n\rfor\t\n\rManuscript\t\n\rID\t\n\r1502493\t\n\rwas submitted';
      expect(extractManuscriptId(text)).toBe('1502493');
    });

    it('should only accept numeric manuscript IDs', () => {
      const text3 = 'Manuscript ID 123456'; // Should match (numeric)
      expect(extractManuscriptId(text3)).toBe('123456');
    });

    it('should extract NIHMS-prefixed manuscript ID', () => {
      const text = 'Package ID=abc123 for NIHMS12345 was submitted';
      expect(extractManuscriptId(text)).toBe('12345');
    });

    it('should extract NIHMS ID with whitespace', () => {
      const text = 'Package ID=abc123 for NIHMS 67890 was submitted';
      expect(extractManuscriptId(text)).toBe('67890');
    });

    it('should extract NIHMS ID case-insensitively', () => {
      const text1 = 'for nihms12345 was submitted';
      expect(extractManuscriptId(text1)).toBe('12345');

      const text2 = 'for Nihms98765 was submitted';
      expect(extractManuscriptId(text2)).toBe('98765');

      const text3 = 'for NIHMS54321 was submitted';
      expect(extractManuscriptId(text3)).toBe('54321');
    });

    it('should prioritize NIHMS pattern over standard Manuscript ID', () => {
      const text = 'NIHMS12345 for Manuscript ID 999999 was submitted';
      expect(extractManuscriptId(text)).toBe('12345');
    });

    it('should extract NIHMS ID with mixed whitespace', () => {
      const text = 'Package ID=abc123\t\n\rfor\t\n\rNIHMS\t\n\r12345\t\n\rwas submitted';
      expect(extractManuscriptId(text)).toBe('12345');
    });

    it('should return null when no manuscript ID found', () => {
      const text = 'Package ID=123 failed with error';
      expect(extractManuscriptId(text)).toBeNull();
    });
  });

  describe('determineMessageType', () => {
    it('should detect error messages', () => {
      const html = '<td>ERROR</td><td>Package ID=123 failed</td>';
      expect(determineMessageType('', html)).toBe('error');
    });

    it('should detect warning messages', () => {
      const html = '<td>WARNING</td><td>Package ID=123 has problems</td>';
      expect(determineMessageType('', html)).toBe('warning');
    });

    it('should detect error from plain text', () => {
      const plain = 'Package ID=123 failed because of validation error';
      expect(determineMessageType(plain, '')).toBe('error');
    });

    it('should default to success when no indicators found', () => {
      const plain = 'Package ID=123 was processed successfully';
      expect(determineMessageType(plain, '')).toBe('success');
    });
  });

  describe('extractMessage', () => {
    it('should extract error message from HTML', () => {
      const html =
        '<td>Package ID=123 failed because of the following meta XML validation error: &lt;string&gt;:1:0:ERROR:VALID:DTD_CONTENT_MODEL</td>';
      const message = extractMessage(html);
      expect(message).toContain('failed because of the following meta XML validation error');
      expect(message).not.toContain('<td>');
      expect(message).not.toContain('&lt;');
    });

    it('should extract warning message', () => {
      const html =
        'Warning: Package ID=191e5fc4eea for Manuscript ID 1502493 was submitted with the following problem(s): "Grant 5R33MH125126-04 was not found"';
      const message = extractMessage(html);
      expect(message).toContain('was submitted with the following problem(s)');
      expect(message).toContain('Grant 5R33MH125126-04 was not found');
    });

    it('should clean up HTML entities and tags', () => {
      const html = '<p>Package ID=123 &quot;failed&quot; with [ERROR] details</p>';
      const message = extractMessage(html);
      expect(message).toBe('failed with [ERROR] details');
    });

    it('should normalize whitespace with tabs', () => {
      const text = 'Package\tID=123\tfailed\twith\ttab\tseparated\twords';
      const message = extractMessage(text);
      expect(message).toBe('failed with tab separated words');
    });

    it('should normalize whitespace with newlines', () => {
      const text = 'Package\nID=123\nfailed\nwith\nnewline\nseparated\nwords';
      const message = extractMessage(text);
      expect(message).toBe('failed with newline separated words');
    });

    it('should normalize whitespace with carriage returns', () => {
      const text = 'Package\rID=123\rfailed\rwith\rcarriage\rreturn\rseparated\rwords';
      const message = extractMessage(text);
      expect(message).toBe('failed with carriage return separated words');
    });

    it('should normalize mixed whitespace characters', () => {
      const text = 'Package\t\n\rID=123\t\n\rfailed\t\n\rwith\t\n\rmixed\t\n\rwhitespace';
      const message = extractMessage(text);
      expect(message).toBe('failed with mixed whitespace');
    });

    it('should handle example from user with whitespace', () => {
      const text = 'Package ID=191e5fc4eea for Manuscript ID\r\n1502493 was submitted';
      const message = extractMessage(text);
      expect(message).toBe('for Manuscript ID 1502493 was submitted');
    });
  });

  describe('parseHTMLTableRows', () => {
    it('should parse single error row from HTML table', () => {
      const html = `
        <table>
          <tr>
            <td>ERROR</td>
            <td>Package ID=621b52177f5f8 failed because of the following meta XML validation error</td>
          </tr>
        </table>
      `;

      const packages = parseHTMLTableRows(html);
      expect(packages).toHaveLength(1);
      expect(packages[0]).toEqual({
        packageId: '621b52177f5f8',
        manuscriptId: undefined,
        status: 'error',
        message: expect.stringContaining(
          'failed because of the following meta XML validation error',
        ),
      });
    });

    it('should parse single warning row from HTML table', () => {
      const html = `
        <table>
          <tr>
            <td>WARNING</td>
            <td>Warning: Package ID=191e5fc4eea for Manuscript ID 1502493 was submitted with the following problem(s): "Grant 5R33MH125126-04 was not found"</td>
          </tr>
        </table>
      `;

      const packages = parseHTMLTableRows(html);
      expect(packages).toHaveLength(1);
      expect(packages[0]).toEqual({
        packageId: '191e5fc4eea',
        manuscriptId: '1502493',
        status: 'warning',
        message: expect.stringContaining('was submitted with the following problem(s)'),
      });
    });

    it('should parse multiple rows from HTML table', () => {
      const html = `
        <table>
          <tr>
            <td>ERROR</td>
            <td>Package ID=123 failed</td>
          </tr>
          <tr>
            <td>WARNING</td>
            <td>Package ID=456 for Manuscript ID 789 has problems</td>
          </tr>
        </table>
      `;

      const packages = parseHTMLTableRows(html);
      expect(packages).toHaveLength(2);
      expect(packages[0].packageId).toBe('123');
      expect(packages[0].status).toBe('error');
      expect(packages[1].packageId).toBe('456');
      expect(packages[1].status).toBe('warning');
      expect(packages[1].manuscriptId).toBe('789');
    });

    it('should ignore rows without package information', () => {
      const html = `
        <table>
          <tr><td>Header 1</td><td>Header 2</td></tr>
          <tr>
            <td>ERROR</td>
            <td>Package ID=123 failed</td>
          </tr>
          <tr><td>Footer</td></tr>
        </table>
      `;

      const packages = parseHTMLTableRows(html);
      expect(packages).toHaveLength(1);
      expect(packages[0].packageId).toBe('123');
    });
  });

  describe('parseEmailContent', () => {
    it('should parse error email with HTML table', () => {
      const html = `
        <table>
          <tr>
            <td>ERROR</td>
            <td>Package ID=621b52177f5f8 failed because of the following meta XML validation error</td>
          </tr>
        </table>
      `;

      const result = parseEmailContent('', html);
      expect(result.type).toBe('error');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].packageId).toBe('621b52177f5f8');
      expect(result.packages[0].status).toBe('error');
    });

    it('should parse warning email with HTML table', () => {
      const html = `
        <table>
          <tr>
            <td>WARNING</td>
            <td>Warning: Package ID=191e5fc4eea for Manuscript ID 1502493 was submitted with the following problem(s): "Grant 5R33MH125126-04 was not found"</td>
          </tr>
        </table>
      `;

      const result = parseEmailContent('', html);
      expect(result.type).toBe('warning');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].packageId).toBe('191e5fc4eea');
      expect(result.packages[0].manuscriptId).toBe('1502493');
      expect(result.packages[0].status).toBe('warning');
    });

    it('should fall back to plain text parsing when no HTML table found', () => {
      const plain = 'Package ID=123 failed with error';
      const result = parseEmailContent(plain, '');
      expect(result.type).toBe('error');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].packageId).toBe('123');
    });

    it('should handle missing package ID gracefully', () => {
      const plain = 'Some random text without package ID';
      const result = parseEmailContent(plain, '');
      expect(result.type).toBe('error');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].packageId).toBe('unknown');
      expect(result.packages[0].message).toBe('Could not extract package ID from email content');
    });

    it('should parse multiple packages from single email', () => {
      const html = `
        <table>
          <tr>
            <td>ERROR</td>
            <td>Package ID=123 failed</td>
          </tr>
          <tr>
            <td>WARNING</td>
            <td>Package ID=456 for Manuscript ID 789 has problems</td>
          </tr>
          <tr>
            <td>ERROR</td>
            <td>Package ID=999 also failed</td>
          </tr>
        </table>
      `;

      const result = parseEmailContent('', html);
      expect(result.packages).toHaveLength(3);
      expect(result.packages.map((p) => p.packageId)).toEqual(['123', '456', '999']);
      expect(result.packages.map((p) => p.status)).toEqual(['error', 'warning', 'error']);
    });

    it('should parse success message with INFO cell', () => {
      const html =
        '<table><tr><td>INFO</td><td>Package ID=123 for Manuscript ID 456 was submitted successfully.</td></tr></table>';
      const result = parseEmailContent('', html);

      expect(result.type).toBe('success');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]).toEqual({
        packageId: '123',
        manuscriptId: '456',
        status: 'success',
        message: 'Package ID=123 for Manuscript ID 456 was submitted successfully.',
      });
    });

    it('should parse success message with forwarded subject', () => {
      const plain = 'INFO Package ID=123 for Manuscript ID 456 was submitted successfully.';
      const result = parseEmailContent(plain, '');

      expect(result.type).toBe('success');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]).toEqual({
        packageId: '123',
        manuscriptId: '456',
        status: 'success',
        message: 'INFO Package ID=123 for Manuscript ID 456 was submitted successfully.',
      });
    });

    it('should parse success message with "successfully" keyword', () => {
      const plain = 'Package ID=123 for Manuscript ID 456 was submitted successfully.';
      const result = parseEmailContent(plain, '');

      expect(result.type).toBe('success');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]).toEqual({
        packageId: '123',
        manuscriptId: '456',
        status: 'success',
        message: 'for Manuscript ID 456 was submitted successfully.',
      });
    });

    it('should parse email with whitespace in package ID and manuscript ID', () => {
      const plain = 'Package\tID=123\tfor\tManuscript\tID\t456\twas submitted successfully.';
      const result = parseEmailContent(plain, '');

      expect(result.type).toBe('success');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]).toEqual({
        packageId: '123',
        manuscriptId: '456',
        status: 'success',
        message: 'for Manuscript ID 456 was submitted successfully.',
      });
    });

    it('should parse email with newlines in package ID and manuscript ID', () => {
      const plain = 'Package\nID=123\nfor\nManuscript\nID\n456\nwas submitted successfully.';
      const result = parseEmailContent(plain, '');

      expect(result.type).toBe('success');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]).toEqual({
        packageId: '123',
        manuscriptId: '456',
        status: 'success',
        message: 'for Manuscript ID 456 was submitted successfully.',
      });
    });

    it('should parse email with mixed whitespace characters', () => {
      const plain =
        'Package\t\n\rID=123\t\n\rfor\t\n\rManuscript\t\n\rID\t\n\r456\t\n\rwas submitted successfully.';
      const result = parseEmailContent(plain, '');

      expect(result.type).toBe('success');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]).toEqual({
        packageId: '123',
        manuscriptId: '456',
        status: 'success',
        message: 'for Manuscript ID 456 was submitted successfully.',
      });
    });

    it('should parse user example with whitespace', () => {
      const text = 'Package ID=191e5fc4eea for Manuscript ID\r\n1502493 was submitted';
      const result = parseEmailContent(text, '');
      expect(result.type).toBe('success');
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]).toEqual({
        packageId: '191e5fc4eea',
        manuscriptId: '1502493',
        status: 'success',
        message: 'for Manuscript ID 1502493 was submitted',
      });
    });
  });

  describe('validateEmailSubject', () => {
    it('should accept subject starting with "bulk submission"', () => {
      const result = validateEmailSubject({ subject: 'Bulk submission (errors encountered)' });
      expect(result.isValid).toBe(true);
    });

    it('should accept forwarded subject with "Fwd:" prefix', () => {
      const result = validateEmailSubject({ subject: 'Fwd: Bulk submission success' });
      expect(result.isValid).toBe(true);
    });

    it('should accept subject containing "bulk submission" anywhere', () => {
      const result = validateEmailSubject({ subject: 'Some prefix: Bulk submission success' });
      expect(result.isValid).toBe(true);
    });

    it('should reject subject without "bulk submission"', () => {
      const result = validateEmailSubject({ subject: 'Some other email subject' });
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('does not match expected pattern');
    });

    it('should reject missing subject', () => {
      const result = validateEmailSubject({});
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Missing subject');
    });
  });
});
