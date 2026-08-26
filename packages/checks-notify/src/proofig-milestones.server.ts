/** Proofig notify states that warrant Slack (terminal outcomes only). */
export const PROOFIG_SLACK_MILESTONE_STATES = new Set([
  'Report: Clean',
  'Report: Flagged',
  'Deleted',
]);

export function isProofigSlackMilestoneState(state: string): boolean {
  return PROOFIG_SLACK_MILESTONE_STATES.has(state);
}

export function proofigMilestoneColor(state: string): 'good' | 'warning' | 'danger' {
  if (state === 'Report: Clean') return 'good';
  if (state === 'Report: Flagged' || state === 'Deleted') return 'warning';
  return 'warning';
}

export function proofigMilestoneMessage(state: string, reportId?: string): string {
  const idSuffix = reportId?.trim() ? ` (${reportId.trim()})` : '';
  switch (state) {
    case 'Report: Clean':
      return `Proofig report clean${idSuffix}`;
    case 'Report: Flagged':
      return `Proofig report flagged${idSuffix}`;
    case 'Deleted':
      return `Proofig run deleted at provider${idSuffix}`;
    default:
      return `Proofig state: ${state}${idSuffix}`;
  }
}
