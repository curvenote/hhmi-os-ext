// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, test } from 'vitest';
import {
  getCoveredArticleComplianceFlags,
  type CoveredArticleComplianceInput,
} from './coveredArticleComplianceFlags.js';

type Case = {
  scenario: string;
  input: CoveredArticleComplianceInput;
  expected: { resolved: boolean; actionRequested: boolean };
};

/**
 * Scenario matrix: `input` → `{ resolved, actionRequested }`.
 * Grouped by comment for scanning; order does not matter.
 */
const COMPLIANCE_FLAG_CASES: Case[] = [
  // —— resolved: false when not compliant (journal looks resolved → still action requested)
  {
    scenario: 'non-compliant + journal Resolved',
    input: {
      compliant: false,
      journal: { complianceIssueStatus: 'Resolved' },
    },
    expected: { resolved: false, actionRequested: true },
  },
  {
    scenario: 'non-compliant + preprint requested action completed (no journal triggers)',
    input: {
      compliant: false,
      preprint: { complianceIssueStatus: 'requested action completed' },
    },
    expected: { resolved: false, actionRequested: false },
  },

  // —— resolved: false when compliant but statuses do not match
  {
    scenario: 'compliant + unrelated journal/preprint statuses',
    input: {
      compliant: true,
      journal: { complianceIssueStatus: 'Outstanding' },
      preprint: { complianceIssueStatus: 'Open' },
    },
    expected: { resolved: false, actionRequested: false },
  },

  // —— resolved: true (case-insensitive / either venue)
  {
    scenario: 'compliant + journal RESOLVED',
    input: {
      compliant: true,
      journal: { complianceIssueStatus: 'RESOLVED' },
    },
    expected: { resolved: true, actionRequested: false },
  },
  {
    scenario: 'compliant + preprint resolved',
    input: {
      compliant: true,
      preprint: { complianceIssueStatus: 'resolved' },
    },
    expected: { resolved: true, actionRequested: false },
  },
  {
    scenario: 'compliant + journal Requested Action Completed',
    input: {
      compliant: true,
      journal: { complianceIssueStatus: 'Requested Action Completed' },
    },
    expected: { resolved: true, actionRequested: false },
  },
  {
    scenario: 'compliant + preprint requested action completed',
    input: {
      compliant: true,
      preprint: { complianceIssueStatus: 'requested action completed' },
    },
    expected: { resolved: true, actionRequested: false },
  },

  // —— compliant undefined (treated as non-compliant for actionRequested)
  {
    scenario: 'compliant undefined + journal resolved',
    input: {
      journal: { complianceIssueStatus: 'resolved' },
    },
    expected: { resolved: false, actionRequested: true },
  },

  // —— actionRequested: false when compliant (even if statuses would otherwise trigger)
  {
    scenario: 'compliant + journal outstanding + preprint fix in progress',
    input: {
      compliant: true,
      journal: { complianceIssueStatus: 'outstanding' },
      preprint: { complianceIssueStatus: 'fix in progress' },
    },
    expected: { resolved: false, actionRequested: false },
  },

  // —— actionRequested: true branches
  {
    scenario: 'non-compliant + journal OUTSTANDING (+ preprint status present)',
    input: {
      compliant: false,
      journal: { complianceIssueStatus: 'OUTSTANDING' },
      preprint: { complianceIssueStatus: 'No Action Needed' },
    },
    expected: { resolved: false, actionRequested: true },
  },
  {
    scenario: 'non-compliant + preprint Fix In Progress',
    input: {
      compliant: false,
      preprint: { complianceIssueStatus: 'Fix In Progress' },
    },
    expected: { resolved: false, actionRequested: true },
  },
  {
    scenario: 'non-compliant + journal status empty string',
    input: {
      compliant: false,
      journal: { complianceIssueStatus: '' },
      preprint: { complianceIssueStatus: 'Open' },
    },
    expected: { resolved: false, actionRequested: true },
  },
  {
    scenario: 'non-compliant + preprint without complianceIssueStatus',
    input: {
      compliant: false,
      preprint: {},
    },
    expected: { resolved: false, actionRequested: true },
  },
  {
    scenario: 'non-compliant + no preprint + journal not outstanding (missing preprint triggers)',
    input: {
      compliant: false,
      journal: { complianceIssueStatus: 'No Action Needed' },
    },
    expected: { resolved: false, actionRequested: true },
  },

  // —— actionRequested: false (non-compliant but no branch matches)
  {
    scenario: 'non-compliant + journal Monitoring + preprint Open',
    input: {
      compliant: false,
      journal: { complianceIssueStatus: 'Monitoring' },
      preprint: { complianceIssueStatus: 'Open' },
    },
    expected: { resolved: false, actionRequested: false },
  },
];

describe('getCoveredArticleComplianceFlags', () => {
  test.each(COMPLIANCE_FLAG_CASES)('$scenario', ({ input, expected }) => {
    expect(getCoveredArticleComplianceFlags(input)).toEqual(expected);
  });
});
