// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import { removeHhmiGrantByUniqueId } from './grants.server.js';
import type { GrantEntry } from '../../common/metadata.schema.js';

describe('removeHhmiGrantByUniqueId', () => {
  const grants: GrantEntry[] = [
    {
      id: '1',
      funderKey: 'hhmi',
      grantId: '  HHMI_Alpha_A  ',
      investigatorName: 'Alex Alpha',
      uniqueId: 'alex_alpha_hhmi_alpha_a',
    },
    { id: '2', funderKey: 'nih', grantId: 'R01HD116750' },
  ];

  it('removes an HHMI grant by persisted uniqueId', () => {
    const next = removeHhmiGrantByUniqueId(grants, 'alex_alpha_hhmi_alpha_a');
    expect(next).toHaveLength(1);
    expect(next[0]?.funderKey).toBe('nih');
  });

  it('derives uniqueId from grantId + name when uniqueId is missing', () => {
    const next = removeHhmiGrantByUniqueId(
      [
        {
          id: '1',
          funderKey: 'hhmi',
          grantId: 'HHMI_Beta_B',
          investigatorName: 'Blair Beta',
        },
      ],
      'blair_beta_hhmi_beta_b',
    );
    expect(next).toEqual([]);
  });

  it('matches when the requested uniqueId has surrounding whitespace', () => {
    const next = removeHhmiGrantByUniqueId(grants, '  alex_alpha_hhmi_alpha_a  ');
    expect(next).toHaveLength(1);
    expect(next[0]?.funderKey).toBe('nih');
  });

  it('returns the same array reference when no HHMI grant matches', () => {
    const next = removeHhmiGrantByUniqueId(grants, 'missing_unique_id');
    expect(next).toBe(grants);
  });
});
