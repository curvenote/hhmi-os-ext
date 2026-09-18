import { getPrismaClient } from '@curvenote/scms-server';
import { PMC_STATE_NAMES, PMC_WORKSPACE_SITE_NAME } from '../../workflows.js';

/**
 * Statuses at or after NIHMS bulk confirm — the latest SV with this manuscript ID
 * owns subsequent manuscript-ID-keyed updates.
 *
 * `REQUEST_NEW_VERSION` / `NO_ACTION_NEEDED` can also be reached from failed/rejected
 * deposits that never confirmed; those require `manuscriptConfirmed !== false`.
 */
export const PMC_MANUSCRIPT_HANDOFF_STATUSES: readonly string[] = [
  PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
  PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
  PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL,
  PMC_STATE_NAMES.SUBMITTERS_FILES_REQUESTED,
  PMC_STATE_NAMES.NIHMS_CONVERSION_COMPLETE,
  PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL,
  PMC_STATE_NAMES.AVAILABLE_ON_PMC,
  PMC_STATE_NAMES.WITHDRAWN_FROM_PMC,
  PMC_STATE_NAMES.REMOVED_FROM_PROCESSING,
  PMC_STATE_NAMES.REQUEST_NEW_VERSION,
  PMC_STATE_NAMES.NO_ACTION_NEEDED,
];

/** Terminal statuses reachable without NIHMS bulk confirm. */
const PMC_AMBIGUOUS_HANDOFF_STATUSES: readonly string[] = [
  PMC_STATE_NAMES.REQUEST_NEW_VERSION,
  PMC_STATE_NAMES.NO_ACTION_NEEDED,
];

export type ManuscriptHandoffVersion = {
  id: string;
  status: string;
  date_created: string | Date;
  /** Set true on bulk confirm; false on clone. `undefined` = legacy row (treat as confirmed). */
  manuscriptConfirmed?: boolean | null;
};

/**
 * Whether this version has taken ownership of the NIHMS manuscript inbox.
 * Ambiguous terminals only count when not explicitly unconfirmed (cloned / never confirmed).
 */
export function hasManuscriptHandoffOccurred(
  status: string,
  manuscriptConfirmed?: boolean | null,
): boolean {
  if (!PMC_MANUSCRIPT_HANDOFF_STATUSES.includes(status)) return false;
  if (PMC_AMBIGUOUS_HANDOFF_STATUSES.includes(status)) {
    return manuscriptConfirmed !== false;
  }
  return true;
}

/**
 * Pick which submission version should receive manuscript-ID-keyed updates.
 * Before the latest version reaches handoff, prefer the most recent prior version
 * that owns the live NIHMS record; after handoff, always use the latest.
 */
export function pickSubmissionVersionForManuscriptId<T extends ManuscriptHandoffVersion>(
  versions: T[],
): T | undefined {
  if (versions.length === 0) return undefined;
  const sorted = [...versions].sort(
    (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime(),
  );
  const [latest, ...rest] = sorted;
  if (
    hasManuscriptHandoffOccurred(latest.status, latest.manuscriptConfirmed) ||
    rest.length === 0
  ) {
    return latest;
  }
  return rest.find((v) => hasManuscriptHandoffOccurred(v.status, v.manuscriptConfirmed)) ?? latest;
}

export type ResolvedManuscriptSubmissionVersion = {
  id: string;
  work_version_id: string;
  submitted_by_id: string;
  status: string;
  date_created: string | Date;
  manuscriptConfirmed?: boolean | null;
  work_version: { work_id: string };
};

function manuscriptConfirmedFromMetadata(metadata: unknown): boolean | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const pmc = (metadata as { pmc?: { emailProcessing?: { manuscriptConfirmed?: unknown } } }).pmc;
  const value = pmc?.emailProcessing?.manuscriptConfirmed;
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Resolve the submission version that should receive updates for a NIHMS manuscript ID.
 */
export async function resolveSubmissionVersionForManuscriptId(
  manuscriptId: string,
): Promise<ResolvedManuscriptSubmissionVersion | null> {
  const prisma = await getPrismaClient();
  const matches = await prisma.submissionVersion.findMany({
    where: {
      submission: {
        site: {
          name: PMC_WORKSPACE_SITE_NAME,
        },
      },
      metadata: {
        path: ['pmc', 'emailProcessing', 'manuscriptId'],
        equals: manuscriptId,
      },
    },
    select: {
      id: true,
      work_version_id: true,
      submitted_by_id: true,
      status: true,
      date_created: true,
      metadata: true,
      work_version: { select: { work_id: true } },
    },
  });

  const withConfirmFlag = matches.map(({ metadata, ...rest }) => ({
    ...rest,
    manuscriptConfirmed: manuscriptConfirmedFromMetadata(metadata),
  }));

  return pickSubmissionVersionForManuscriptId(withConfirmFlag) ?? null;
}
