import { getPrismaClient } from '@curvenote/scms-server';
import { PMC_STATE_NAMES, PMC_WORKSPACE_SITE_NAME } from '../../workflows.js';

/**
 * Statuses at or after NIHMS bulk confirm — the latest SV with this manuscript ID
 * owns subsequent manuscript-ID-keyed updates.
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

export function hasManuscriptHandoffOccurred(status: string): boolean {
  return PMC_MANUSCRIPT_HANDOFF_STATUSES.includes(status);
}

/**
 * Pick which submission version should receive manuscript-ID-keyed updates.
 * Before the latest version reaches handoff, prefer the prior version that still
 * owns the live NIHMS record; after handoff, always use the latest.
 */
export function pickSubmissionVersionForManuscriptId<
  T extends { id: string; status: string; date_created: string | Date },
>(versions: T[]): T | undefined {
  if (versions.length === 0) return undefined;
  const sorted = [...versions].sort(
    (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime(),
  );
  const [latest, ...rest] = sorted;
  if (hasManuscriptHandoffOccurred(latest.status) || rest.length === 0) return latest;
  return rest[0];
}

export type ResolvedManuscriptSubmissionVersion = {
  id: string;
  work_version_id: string;
  submitted_by_id: string;
  status: string;
  date_created: string | Date;
  work_version: { work_id: string };
};

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
      work_version: { select: { work_id: true } },
    },
  });

  return pickSubmissionVersionForManuscriptId(matches) ?? null;
}
