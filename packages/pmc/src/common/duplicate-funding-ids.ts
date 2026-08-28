import type { HHMIScientist } from '../backend/hhmi-grants.server.js';
import { normalizeGrantId } from './validation.js';

export type DuplicateGrantGroup = {
  grantId: string;
  scientists: HHMIScientist[];
};

export type DuplicateGrantClassification = {
  unresolved: DuplicateGrantGroup[];
  resolved: DuplicateGrantGroup[];
};

/**
 * Same name-key rules as createHhmiGrantUniqueId (trim → lower → whitespace → _).
 */
export function normalizeInvestigatorNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

function isResolvedByInvestigatorName(scientists: HHMIScientist[]): boolean {
  const keys = scientists.map((s) => normalizeInvestigatorNameKey(s.fullName ?? ''));
  if (keys.some((key) => !key)) return false;
  return new Set(keys).size === keys.length;
}

/**
 * Group scientists by trimmed funding ID and split duplicate groups into
 * unresolved (name does not uniquely disambiguate) vs resolved by name.
 */
export function classifyDuplicateGrantGroups(
  scientists: HHMIScientist[],
): DuplicateGrantClassification {
  const byGrantId = new Map<string, HHMIScientist[]>();

  for (const scientist of scientists) {
    const grantId = normalizeGrantId(scientist.grantId ?? '');
    if (!grantId) continue;
    const existing = byGrantId.get(grantId);
    if (existing) {
      existing.push(scientist);
    } else {
      byGrantId.set(grantId, [scientist]);
    }
  }

  const unresolved: DuplicateGrantGroup[] = [];
  const resolved: DuplicateGrantGroup[] = [];

  for (const [grantId, group] of byGrantId) {
    if (group.length < 2) continue;
    const entry = { grantId, scientists: group };
    if (isResolvedByInvestigatorName(group)) {
      resolved.push(entry);
    } else {
      unresolved.push(entry);
    }
  }

  return { unresolved, resolved };
}

export function countDuplicateSummary(groups: DuplicateGrantGroup[]): {
  fundingIdCount: number;
  recordCount: number;
} {
  return {
    fundingIdCount: groups.length,
    recordCount: groups.reduce((sum, group) => sum + group.scientists.length, 0),
  };
}
