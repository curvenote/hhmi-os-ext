// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, test } from 'vitest';
import {
  getComplianceListStatus,
  type ComplianceListStatus,
  type CoveredArticleComplianceInput,
} from './complianceStatus.js';

/**
 * Omitted `pre` / `journal` = no `complianceIssueStatus` (missing field or `''` in production).
 * Spec table "Requested Action Completed" → `Resolved`.
 */
type MatrixRow = {
  compliant: boolean;
  pre?: string;
  journal?: string;
  /** Full shape returned by `getComplianceListStatus` (explicit for review). */
  expected: ComplianceListStatus;
};

function buildInput(
  row: Pick<MatrixRow, 'compliant' | 'pre' | 'journal'>,
): CoveredArticleComplianceInput {
  const input: CoveredArticleComplianceInput = {
    compliant: row.compliant,
  };
  if (row.pre !== undefined) {
    input.preprint = { complianceIssueStatus: row.pre };
  } else {
    input.preprint = {};
  }
  if (row.journal !== undefined) {
    input.journal = { complianceIssueStatus: row.journal };
  } else {
    input.journal = {};
  }
  return input;
}

function fmtCellTestTitle(v: string | undefined): string {
  return v === undefined ? '[no status]' : v;
}

const COMPLIANCE_MATRIX: MatrixRow[] = [
  {
    compliant: true,
    expected: {
      compliant: true,
      label: 'Compliant',
      resolved: false,
      actionRequested: false,
    },
  },
  {
    compliant: true,
    pre: 'requested action completed',
    expected: {
      compliant: true,
      label: 'Resolved',
      resolved: true,
      actionRequested: false,
    },
  },
  {
    compliant: true,
    journal: 'requested action completed',
    expected: {
      compliant: true,
      label: 'Resolved',
      resolved: true,
      actionRequested: false,
    },
  },
  {
    compliant: true,
    pre: 'requested action completed',
    journal: 'requested action completed',
    expected: {
      compliant: true,
      label: 'Resolved',
      resolved: true,
      actionRequested: false,
    },
  },
  {
    compliant: false,
    expected: {
      compliant: false,
      label: 'Action Requested',
      resolved: false,
      actionRequested: true,
    },
  },
  {
    compliant: false,
    journal: 'hhmi monitoring',
    expected: {
      compliant: false,
      label: 'No Action Needed',
      resolved: false,
      actionRequested: false,
    },
  },
  {
    compliant: false,
    journal: 'outstanding',
    expected: {
      compliant: false,
      label: 'Action Requested',
      resolved: false,
      actionRequested: true,
    },
  },
  {
    compliant: false,
    journal: 'fix in progress',
    expected: {
      compliant: false,
      label: 'Action Requested',
      resolved: false,
      actionRequested: true,
    },
  },
  {
    compliant: false,
    journal: 'no action needed',
    expected: {
      compliant: false,
      label: 'No Action Needed',
      resolved: false,
      actionRequested: false,
    },
  },

  {
    compliant: false,
    pre: 'outstanding',
    expected: {
      compliant: false,
      label: 'Action Requested',
      resolved: false,
      actionRequested: true,
    },
  },
  {
    compliant: false,
    pre: 'fix in progress',
    expected: {
      compliant: false,
      label: 'Action Requested',
      resolved: false,
      actionRequested: true,
    },
  },

  {
    compliant: false,
    pre: 'hhmi monitoring',
    journal: 'no action needed',
    expected: {
      compliant: false,
      label: 'No Action Needed',
      resolved: false,
      actionRequested: false,
    },
  },
  {
    compliant: false,
    pre: 'outstanding',
    journal: 'no action needed',
    expected: {
      compliant: false,
      label: 'Action Requested',
      resolved: false,
      actionRequested: true,
    },
  },
  {
    compliant: false,
    pre: 'fix in progress',
    journal: 'no action needed',
    expected: {
      compliant: false,
      label: 'Action Requested',
      resolved: false,
      actionRequested: true,
    },
  },

  {
    compliant: false,
    pre: 'no action needed',
    journal: 'hhmi monitoring',
    expected: {
      compliant: false,
      label: 'No Action Needed',
      resolved: false,
      actionRequested: false,
    },
  },
  {
    compliant: false,
    pre: 'no action needed',
    journal: 'outstanding',
    expected: {
      compliant: false,
      label: 'Action Requested',
      resolved: false,
      actionRequested: true,
    },
  },
  {
    compliant: false,
    pre: 'no action needed',
    journal: 'fix in progress',
    expected: {
      compliant: false,
      label: 'Action Requested',
      resolved: false,
      actionRequested: true,
    },
  },
];

describe('getComplianceListStatus (spec matrix)', () => {
  test.each(
    COMPLIANCE_MATRIX.map((row, i) => ({
      ...row,
      caseName: `#${i + 1} ${row.compliant ? 'yes' : 'no'} pre=${fmtCellTestTitle(row.pre)} journal=${fmtCellTestTitle(row.journal)} → ${row.expected.label}`,
    })),
  )('$caseName', (row) => {
    const input = buildInput({
      compliant: row.compliant,
      pre: row.pre,
      journal: row.journal,
    });
    const { expected } = row;
    const status = getComplianceListStatus(input);
    expect(status).toBeDefined();
    expect(status).toEqual(expected);
  });
});

describe('edge cases', () => {
  test('omitted matrix status (undefined) matches empty string status', () => {
    const row = COMPLIANCE_MATRIX[0]!;
    const omitted = buildInput(row);
    const emptyStrings: CoveredArticleComplianceInput = {
      ...omitted,
      preprint: { complianceIssueStatus: '' },
      journal: { complianceIssueStatus: '' },
    };
    expect(getComplianceListStatus(omitted)).toEqual(getComplianceListStatus(emptyStrings));
  });

  test('compliant undefined on input yields compliant false on status', () => {
    const status = getComplianceListStatus({
      journal: { complianceIssueStatus: 'hhmi monitoring' },
    });
    expect(status).toBeDefined();
    expect(status!.compliant).toBe(false);
  });

  test('neither journal nor preprint: compliant true → Compliant', () => {
    expect(getComplianceListStatus({ compliant: true })).toEqual({
      compliant: true,
      label: 'Compliant',
      resolved: false,
      actionRequested: false,
    });
  });

  test('neither journal nor preprint: compliant false → Action Requested', () => {
    expect(getComplianceListStatus({ compliant: false })).toEqual({
      compliant: false,
      label: 'Action Requested',
      resolved: false,
      actionRequested: true,
    });
  });

  /** Not in matrix; ensures journal "Resolved" while non-compliant still requests action. */
  test('non-compliant + journal Resolved (data inconsistency) → Action Requested', () => {
    const status = getComplianceListStatus({
      compliant: false,
      journal: { complianceIssueStatus: 'Resolved' },
      preprint: {},
    });
    expect(status!.label).toBe('Action Requested');
  });

  /** Preprint-only "requested action completed" while non-compliant → no action (unchanged). */
  test('non-compliant + preprint requested action completed only → No Action Needed', () => {
    const status = getComplianceListStatus({
      compliant: false,
      preprint: { complianceIssueStatus: 'requested action completed' },
      journal: {},
    });
    expect(status!.label).toBe('No Action Needed');
  });

  test('compliant + unrelated journal/preprint statuses → Compliant', () => {
    const status = getComplianceListStatus({
      compliant: true,
      journal: { complianceIssueStatus: 'Outstanding' },
      preprint: { complianceIssueStatus: 'Open' },
    });
    expect(status!.label).toBe('Compliant');
  });
});
