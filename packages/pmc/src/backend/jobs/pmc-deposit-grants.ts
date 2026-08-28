import type { AAMDepositManifest } from 'pmc-utils';
import type { GrantEntry } from '../../common/metadata.schema.js';
import { normalizeGrantId } from '../../common/validation.js';
import { getHHMIScientistByGrantIdAndName, type HHMIScientist } from '../hhmi-grants.server.js';

export type ManifestGrant = AAMDepositManifest['metadata']['grants'][number];

export function grantPiFromScientistRecord(scientist: HHMIScientist) {
  const fname = scientist.firstName?.trim();
  const lname = scientist.lastName?.trim();
  const email = scientist.email?.trim();

  if (!fname) {
    throw new Error(`Grant ${scientist.grantId}: PI first name is missing`);
  }
  if (!lname) {
    throw new Error(`Grant ${scientist.grantId}: PI last name is missing`);
  }
  if (!email) {
    throw new Error(`Grant ${scientist.grantId}: PI email is missing`);
  }

  return { fname, lname, email };
}

/**
 * Ensure an HHMI grant can be deposited (synced contact + complete PI fields).
 * Resolves by grantId + investigator name — grant IDs alone are not unique.
 */
export async function assertHhmiGrantReadyForDeposit(
  grantId: string,
  investigatorName: string,
  context?: { workVersionId?: string },
): Promise<HHMIScientist> {
  const id = normalizeGrantId(grantId);
  const name = investigatorName?.trim() ?? '';
  if (!id) {
    throw new Error('Grant ID is required for HHMI funding');
  }
  if (!name) {
    throw new Error(`Grant ${id}: investigator name is required`);
  }

  const scientist = await getHHMIScientistByGrantIdAndName(id, name);
  const suffix = context?.workVersionId ? ` (workVersion ${context.workVersionId})` : '';

  if (!scientist) {
    throw new Error(`Grant ${id} (${name}): no matching grant contact record found${suffix}`);
  }

  try {
    grantPiFromScientistRecord(scientist);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message}${suffix}`);
  }

  return scientist;
}

export async function buildManifestGrants(
  grants: GrantEntry[],
  context?: { workVersionId?: string; submissionId?: string },
): Promise<ManifestGrant[]> {
  const manifestGrants: ManifestGrant[] = [];
  const ctxSuffix = [
    context?.workVersionId ? `workVersion ${context.workVersionId}` : null,
    context?.submissionId ? `submission ${context.submissionId}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const suffix = ctxSuffix ? ` (${ctxSuffix})` : '';

  for (const grant of grants) {
    const id = normalizeGrantId(grant.grantId);
    const funder = grant.funderKey;

    if (funder !== 'hhmi') {
      manifestGrants.push({ funder, id });
      continue;
    }

    if (!id) {
      throw new Error(`Grant ID is required for PMC deposit${suffix}`);
    }

    try {
      const scientist = await assertHhmiGrantReadyForDeposit(id, grant.investigatorName ?? '');
      manifestGrants.push({
        funder,
        id,
        pi: grantPiFromScientistRecord(scientist),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(suffix && !message.includes(ctxSuffix) ? `${message}${suffix}` : message);
    }
  }

  return manifestGrants;
}
