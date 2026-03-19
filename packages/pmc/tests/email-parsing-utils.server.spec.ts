// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import { extractManuscriptId } from '../src/backend/email/handlers/email-parsing-utils.server.js';

describe('email-parsing-utils', () => {
  describe('extractManuscriptId', () => {
    it.each<{ input: string; expected: string | null; description?: string }>([
      // NIHMS pattern (checked first)
      {
        input: 'NIHMS12345',
        expected: '12345',
        description: 'NIHMS prefix with no space',
      },
      {
        input: 'NIHMS 2109555',
        expected: '2109555',
        description: 'NIHMS with space before digits',
      },
      {
        input: 'Your submission (NIHMS2109555) has been received',
        expected: '2109555',
        description: 'NIHMS in parentheses in sentence',
      },
      {
        input: 'nihms99999',
        expected: '99999',
        description: 'lowercase nihms',
      },
      // Manuscript ID patterns
      {
        input: 'Package ID=191e5fc4eea for Manuscript ID 1502493 was submitted',
        expected: '1502493',
        description: '"for Manuscript ID" with numeric ID',
      },
      {
        input: 'Manuscript ID 1502493',
        expected: '1502493',
        description: '"Manuscript ID" with numeric ID',
      },
      {
        input: 'Manuscript ID ABC123',
        expected: 'ABC123',
        description: '"Manuscript ID" with alphanumeric ID',
      },
      {
        input: 'for Manuscript ID XYZ789',
        expected: 'XYZ789',
        description: '"for Manuscript ID" with alphanumeric ID',
      },
      {
        input: 'Manuscript\tID\t12345',
        expected: '12345',
        description: 'tab-separated Manuscript ID',
      },
      {
        input: 'Manuscript\nID\n99999',
        expected: '99999',
        description: 'newline-separated Manuscript ID',
      },
      {
        input: ' against allergy." (NIHMS2146980) Dear Howard Hughes Medical Institute, The cap',
        expected: '2146980',
        description: 'Real-world example from NIHMS files request email',
      },
      // No match / edge cases
      {
        input: '',
        expected: null,
        description: 'empty string',
      },
      {
        input: 'No manuscript or NIHMS here',
        expected: null,
        description: 'no matching pattern',
      },
      {
        input: 'Manuscript ID ', // no ID after
        expected: null,
        description: 'Manuscript ID with no value',
      },
    ])('$description', ({ input, expected }) => {
      expect(extractManuscriptId(input)).toBe(expected);
    });
  });
});
