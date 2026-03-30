import type { NormalizedArticleRecord } from '../backend/types.js';

export type CoveredArticleComplianceInput = Pick<
  NormalizedArticleRecord,
  'compliant' | 'preprint' | 'journal'
>;

/**
 * Derives list-row compliance flags used by {@link CoveredArticleItem} for the badge.
 */
export function getCoveredArticleComplianceFlags(item: CoveredArticleComplianceInput): {
  resolved: boolean;
  actionRequested: boolean;
} {
  const resolved = Boolean(
    item.compliant &&
    (item.journal?.complianceIssueStatus?.toLowerCase() === 'resolved' ||
      item.preprint?.complianceIssueStatus?.toLowerCase() === 'resolved' ||
      item.preprint?.complianceIssueStatus?.toLowerCase() === 'requested action completed' ||
      item.journal?.complianceIssueStatus?.toLowerCase() === 'requested action completed'),
  );

  const actionRequested =
    !item.compliant &&
    Boolean(
      item.journal?.complianceIssueStatus?.toLowerCase() === 'outstanding' ||
      item.preprint?.complianceIssueStatus?.toLowerCase() === 'fix in progress' ||
      item.journal?.complianceIssueStatus?.toLowerCase() === '' ||
      !item.preprint?.complianceIssueStatus,
    );

  return { resolved, actionRequested };
}
