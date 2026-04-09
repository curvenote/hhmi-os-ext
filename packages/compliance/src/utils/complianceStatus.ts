import type { NormalizedArticleRecord } from '../backend/types.js';

export type CoveredArticleComplianceInput = Pick<
  NormalizedArticleRecord,
  'compliant' | 'preprint' | 'journal'
>;

/** Short status label shown on list badges, modal headlines, and help-request email. */
export type ComplianceListStatusLabel =
  | 'Compliant'
  | 'Requested Action Completed'
  | 'Action Requested'
  | 'No Action Needed';

export type ComplianceListStatus = {
  label: ComplianceListStatusLabel;
  compliant: boolean;
  resolved: boolean;
  actionRequested: boolean;
};

function normStatus(raw: string | undefined | null): string {
  return (raw ?? '').trim().toLowerCase();
}

/**
 * Derives list-row compliance flags used by {@link CoveredArticleItem} for the badge.
 */
function getCoveredArticleComplianceFlags(item: CoveredArticleComplianceInput): {
  resolved: boolean;
  actionRequested: boolean;
} {
  const compliant = item.compliant ?? false;
  const j = normStatus(item.journal?.complianceIssueStatus);
  const p = normStatus(item.preprint?.complianceIssueStatus);
  const requestedActionCompleted = 'requested action completed';

  const resolved = Boolean(
    compliant &&
    (j === 'resolved' ||
      p === 'resolved' ||
      j === requestedActionCompleted ||
      p === requestedActionCompleted),
  );

  const actionRequested =
    !compliant &&
    !isExemptFromActionRequested(j, p) &&
    Boolean(
      j === 'outstanding' ||
      j === 'fix in progress' ||
      (j === '' && p !== requestedActionCompleted) ||
      p === 'outstanding' ||
      p === 'fix in progress' ||
      (p === '' && j !== requestedActionCompleted),
    );

  return { resolved, actionRequested };
}

/**
 * Venues that still require follow-up: if either side is in this set, do not exempt the row.
 * (e.g. preprint outstanding + journal "no action needed" → still Action Requested.)
 */
function isExemptFromActionRequested(j: string, p: string): boolean {
  if (
    j === 'outstanding' ||
    j === 'fix in progress' ||
    p === 'outstanding' ||
    p === 'fix in progress'
  ) {
    return false;
  }
  return j === 'no action needed' || j === 'hhmi monitoring' || p === 'no action needed';
}

/**
 * Same rules as the compliance list badge primary label.
 */
function getComplianceListStatusLabelFromFlags(
  compliant: boolean,
  resolved: boolean,
  actionRequested: boolean,
): ComplianceListStatusLabel {
  if (!compliant) {
    return actionRequested ? 'Action Requested' : 'No Action Needed';
  }
  if (resolved) {
    return 'Requested Action Completed';
  }
  return 'Compliant';
}

/**
 * Omitted or undefined `item.compliant` is treated as `false`.
 * When both `journal` and `preprint` are absent, normalized venue statuses are empty: compliant
 * publications yield **Compliant**, non-compliant yield **Action Requested** (same as empty venue objects).
 */
export function getComplianceListStatus(item: CoveredArticleComplianceInput): ComplianceListStatus {
  const compliant = item.compliant ?? false;
  const { resolved, actionRequested } = getCoveredArticleComplianceFlags(item);
  const label = getComplianceListStatusLabelFromFlags(compliant, resolved, actionRequested);
  return { label, compliant, resolved, actionRequested };
}
