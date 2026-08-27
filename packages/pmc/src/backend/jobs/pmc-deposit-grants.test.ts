import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildManifestGrants, grantPiFromScientistRecord } from './pmc-deposit-grants.js';
import type { GrantEntry } from '../../common/metadata.schema.js';
import type { HHMIScientist } from '../hhmi-grants.server.js';

vi.mock('../hhmi-grants.server.js', () => ({
  getHHMIScientistByGrantId: vi.fn(),
}));

import { getHHMIScientistByGrantId } from '../hhmi-grants.server.js';

const mockGetScientist = vi.mocked(getHHMIScientistByGrantId);

const completeScientist: HHMIScientist = {
  id: 'rec001',
  fullName: 'Alex Alpha',
  firstName: 'Alex',
  lastName: 'Alpha',
  email: 'alex.alpha@example.com',
  grantId: 'GRANT_Alpha_A',
  orcid: '0000-0000-0000-0001',
};

describe('grantPiFromScientistRecord', () => {
  it('maps firstName, lastName, and email', () => {
    expect(grantPiFromScientistRecord(completeScientist)).toEqual({
      fname: 'Alex',
      lname: 'Alpha',
      email: 'alex.alpha@example.com',
    });
  });

  it('throws when email is missing', () => {
    expect(() => grantPiFromScientistRecord({ ...completeScientist, email: '  ' })).toThrow(
      /email is missing/,
    );
  });
});

describe('buildManifestGrants', () => {
  beforeEach(() => {
    mockGetScientist.mockReset();
  });

  it('adds pi for institutional grants with a matching contact record', async () => {
    mockGetScientist.mockResolvedValue(completeScientist);

    const grants: GrantEntry[] = [{ id: '1', funderKey: 'hhmi', grantId: 'GRANT_Alpha_A' }];

    const result = await buildManifestGrants(grants);

    expect(result).toEqual([
      {
        funder: 'hhmi',
        id: 'GRANT_Alpha_A',
        pi: {
          fname: 'Alex',
          lname: 'Alpha',
          email: 'alex.alpha@example.com',
        },
      },
    ]);
    expect(mockGetScientist).toHaveBeenCalledWith('GRANT_Alpha_A');
  });

  it('omits pi for other funders', async () => {
    const grants: GrantEntry[] = [{ id: '1', funderKey: 'nih', grantId: 'R01HD116750' }];

    const result = await buildManifestGrants(grants);

    expect(result).toEqual([{ funder: 'nih', id: 'R01HD116750' }]);
    expect(mockGetScientist).not.toHaveBeenCalled();
  });

  it('adds pi only where contact lookup applies in mixed grant lists', async () => {
    mockGetScientist.mockResolvedValue({
      ...completeScientist,
      grantId: 'GRANT_Beta_B',
      firstName: 'Blair',
      lastName: 'Beta',
      email: 'blair.beta@example.com',
    });

    const grants: GrantEntry[] = [
      { id: '1', funderKey: 'hhmi', grantId: 'GRANT_Beta_B' },
      { id: '2', funderKey: 'nih', grantId: 'R01HD116750' },
      { id: '3', funderKey: 'nih', grantId: 'R00HD104902' },
    ];

    const result = await buildManifestGrants(grants);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      funder: 'hhmi',
      id: 'GRANT_Beta_B',
      pi: { fname: 'Blair', lname: 'Beta', email: 'blair.beta@example.com' },
    });
    expect(result[1]).toEqual({ funder: 'nih', id: 'R01HD116750' });
    expect(result[2]).toEqual({ funder: 'nih', id: 'R00HD104902' });
  });

  it('throws when no contact record matches the grant id', async () => {
    mockGetScientist.mockResolvedValue(null);

    await expect(
      buildManifestGrants([{ id: '1', funderKey: 'hhmi', grantId: 'GRANT_Unknown' }]),
    ).rejects.toThrow(/no matching grant contact record found/);
  });

  it('throws when PI contact fields are incomplete', async () => {
    mockGetScientist.mockResolvedValue({ ...completeScientist, email: '' });

    await expect(
      buildManifestGrants([{ id: '1', funderKey: 'hhmi', grantId: 'GRANT_Alpha_A' }]),
    ).rejects.toThrow(/email is missing/);
  });
});
