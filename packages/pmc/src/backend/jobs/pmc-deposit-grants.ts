import type { AAMDepositManifest } from 'pmc-utils';
import type { GrantEntry } from '../../common/metadata.schema.js';
import { normalizeGrantId } from '../../common/validation.js';
import {
  getHHMIScientistByGrantId,
  type HHMIScientist,
} from '../hhmi-grants.server.js';

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

export async function buildManifestGrants(grants: GrantEntry[]): Promise<ManifestGrant[]> {
  const manifestGrants: ManifestGrant[] = [];

  for (const grant of grants) {
    const id = normalizeGrantId(grant.grantId);
    const funder = grant.funderKey;

    if (funder !== 'hhmi') {
      manifestGrants.push({ funder, id });
      continue;
    }

    if (!id) {
      throw new Error('Grant ID is required for PMC deposit');
    }

    const scientist = await getHHMIScientistByGrantId(id);
    if (!scientist) {
      throw new Error(`Grant ${id}: no matching grant contact record found`);
    }

    manifestGrants.push({
      funder,
      id,
      pi: grantPiFromScientistRecord(scientist),
    });
  }

  return manifestGrants;
}
