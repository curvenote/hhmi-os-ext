import type { NihmsRecord } from './nihms-api.server.js';

/** A PMC submission version in our database, flattened for correlation. */
export type WorkspaceVersion = {
  submissionVersionId: string;
  submissionId: string;
  status: string;
  dateCreated: string;
  /** Our package ID for this deposit (WorkVersion id). */
  workVersionId: string;
  workId: string;
  title?: string;
  /** Stored `metadata.pmc.emailProcessing.manuscriptId` (bare digits or `NIHMS…`). */
  manuscriptId?: string;
};

/**
 * How a version relates to a NIHMS record:
 * - `package`: its WorkVersion id is the record's `bulk-submission-id`
 * - `manuscript`: its stored manuscript ID is the record's NIHMSID
 * - `same-work`: another version of a work that matched directly
 */
export type VersionMatch = 'package' | 'manuscript' | 'package+manuscript' | 'same-work';

export type CorrelatedVersion = WorkspaceVersion & { match: VersionMatch };

export type CorrelatedRecord = {
  record: NihmsRecord;
  /** All versions of the matched work(s), newest first. */
  versions: CorrelatedVersion[];
  /** Our workflow state for the NIHMS `current-status`, when the status is mapped. */
  mappedStatus?: string;
  /** The directly matched version used for the status comparison. */
  comparedVersionId?: string;
  flags: {
    /** No version in our database matches by package ID or manuscript ID. */
    unmatched: boolean;
    /** The matched work maps to more than one NIHMS record. */
    duplicate: boolean;
    /** The mapped NIHMS status differs from the directly matched version's status. */
    statusDiffers: boolean;
  };
};

/** Strip any `NIHMS` prefix so stored IDs compare with the API's bare NIHMSID. */
export function normalizeManuscriptId(id?: string | null): string | undefined {
  const trimmed = id?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^NIHMS\s*/i, '');
}

function push<K, V>(map: Map<K, V[]>, key: K | undefined, value: V) {
  if (key === undefined) return;
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function byNewest(a: WorkspaceVersion, b: WorkspaceVersion) {
  return new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime();
}

/**
 * Correlate NIHMS records with our PMC submission versions, by package ID
 * (`bulk-submission-id` = WorkVersion id) and by manuscript ID (NIHMSID).
 */
export function correlateNihmsRecords(
  records: NihmsRecord[],
  versions: WorkspaceVersion[],
  statusLookup: Record<string, string>,
): CorrelatedRecord[] {
  const byPackage = new Map<string, WorkspaceVersion[]>();
  const byManuscript = new Map<string, WorkspaceVersion[]>();
  const byWork = new Map<string, WorkspaceVersion[]>();
  for (const v of versions) {
    push(byPackage, v.workVersionId, v);
    push(byManuscript, normalizeManuscriptId(v.manuscriptId), v);
    push(byWork, v.workId, v);
  }

  const direct = records.map((record) => {
    const pkg = record.packageId ? (byPackage.get(record.packageId) ?? []) : [];
    const ms = byManuscript.get(normalizeManuscriptId(record.nihmsId) ?? '') ?? [];
    const matches = new Map<string, VersionMatch>();
    for (const v of pkg) matches.set(v.submissionVersionId, 'package');
    for (const v of ms) {
      matches.set(
        v.submissionVersionId,
        matches.get(v.submissionVersionId) === 'package' ? 'package+manuscript' : 'manuscript',
      );
    }
    const workIds = new Set([...pkg, ...ms].map((v) => v.workId));
    return { record, pkg, ms, matches, workIds };
  });

  const nihmsIdsByWork = new Map<string, Set<string>>();
  for (const { record, workIds } of direct) {
    for (const workId of workIds) {
      const ids = nihmsIdsByWork.get(workId) ?? new Set<string>();
      ids.add(record.nihmsId);
      nihmsIdsByWork.set(workId, ids);
    }
  }

  return direct.map(({ record, pkg, ms, matches, workIds }) => {
    const related = [...workIds]
      .flatMap((workId) => byWork.get(workId) ?? [])
      .sort(byNewest)
      .map((v) => ({ ...v, match: matches.get(v.submissionVersionId) ?? ('same-work' as const) }));

    const compared = [...pkg].sort(byNewest)[0] ?? [...ms].sort(byNewest)[0];
    const mappedStatus = record.currentStatus ? statusLookup[record.currentStatus] : undefined;

    return {
      record,
      versions: related,
      mappedStatus,
      comparedVersionId: compared?.submissionVersionId,
      flags: {
        unmatched: matches.size === 0,
        duplicate: [...workIds].some((workId) => (nihmsIdsByWork.get(workId)?.size ?? 0) > 1),
        statusDiffers: !!compared && !!mappedStatus && compared.status !== mappedStatus,
      },
    };
  });
}
