// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildManifestGrants,
  grantPiFromScientistRecord,
  assertHhmiGrantReadyForDeposit,
} from './pmc-deposit-grants.js';
import type { GrantEntry } from '../../common/metadata.schema.js';
import type { HHMIScientist } from '../hhmi-grants.server.js';

vi.mock('../hhmi-grants.server.js', () => ({
  getHHMIScientistByGrantIdAndName: vi.fn(),
}));

import { getHHMIScientistByGrantIdAndName } from '../hhmi-grants.server.js';

const mockGetScientist = vi.mocked(getHHMIScientistByGrantIdAndName);

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

    const grants: GrantEntry[] = [
      {
        id: '1',
        funderKey: 'hhmi',
        grantId: 'GRANT_Alpha_A',
        investigatorName: 'Alex Alpha',
        uniqueId: 'alex_alpha_grant_alpha_a',
      },
    ];

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
    expect(mockGetScientist).toHaveBeenCalledWith('GRANT_Alpha_A', 'Alex Alpha');
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
      {
        id: '1',
        funderKey: 'hhmi',
        grantId: 'GRANT_Beta_B',
        investigatorName: 'Blair Beta',
      },
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

  it('throws when investigator name is missing', async () => {
    await expect(
      buildManifestGrants([{ id: '1', funderKey: 'hhmi', grantId: 'GRANT_Unknown' }]),
    ).rejects.toThrow(/investigator name is required/);
  });

  it('throws when no contact record matches grantId + name', async () => {
    mockGetScientist.mockResolvedValue(null);

    await expect(
      buildManifestGrants([
        {
          id: '1',
          funderKey: 'hhmi',
          grantId: 'GRANT_Unknown',
          investigatorName: 'Unknown Person',
        },
      ]),
    ).rejects.toThrow(/no matching grant contact record found/);
  });

  it('throws when PI contact fields are incomplete', async () => {
    mockGetScientist.mockResolvedValue({ ...completeScientist, email: '' });

    await expect(
      buildManifestGrants([
        {
          id: '1',
          funderKey: 'hhmi',
          grantId: 'GRANT_Alpha_A',
          investigatorName: 'Alex Alpha',
        },
      ]),
    ).rejects.toThrow(/email is missing/);
  });

  it('includes work/submission ids in deposit-time errors', async () => {
    mockGetScientist.mockResolvedValue(null);

    await expect(
      buildManifestGrants(
        [
          {
            id: '1',
            funderKey: 'hhmi',
            grantId: 'GRANT_Unknown',
            investigatorName: 'Unknown Person',
          },
        ],
        {
          workVersionId: 'wv-1',
          submissionId: 'sub-1',
        },
      ),
    ).rejects.toThrow(/workVersion wv-1.*submission sub-1/);
  });
});

describe('assertHhmiGrantReadyForDeposit', () => {
  beforeEach(() => {
    mockGetScientist.mockReset();
  });

  it('resolves when the contact record has complete PI fields', async () => {
    mockGetScientist.mockResolvedValue(completeScientist);
    await expect(assertHhmiGrantReadyForDeposit('GRANT_Alpha_A', 'Alex Alpha')).resolves.toEqual(
      completeScientist,
    );
  });

  it('throws before deposit when PI email is missing', async () => {
    mockGetScientist.mockResolvedValue({ ...completeScientist, email: ' ' });
    await expect(
      assertHhmiGrantReadyForDeposit('GRANT_Alpha_A', 'Alex Alpha', {
        workVersionId: 'wv-9',
      }),
    ).rejects.toThrow(/email is missing.*workVersion wv-9/);
  });
});
