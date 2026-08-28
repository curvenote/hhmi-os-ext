// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import { removeHhmiGrantByGrantId } from './grants.server.js';
import type { GrantEntry } from '../../common/metadata.schema.js';

describe('removeHhmiGrantByGrantId', () => {
  const grants: GrantEntry[] = [
    { id: '1', funderKey: 'hhmi', grantId: '  HHMI_Alpha_A  ', investigatorName: 'Alex' },
    { id: '2', funderKey: 'nih', grantId: 'R01HD116750' },
  ];

  it('removes an HHMI grant when stored grantId has surrounding whitespace', () => {
    const next = removeHhmiGrantByGrantId(grants, 'HHMI_Alpha_A');
    expect(next).toHaveLength(1);
    expect(next[0]?.funderKey).toBe('nih');
  });

  it('matches when the requested grantId is untrimmed', () => {
    const next = removeHhmiGrantByGrantId(
      [{ id: '1', funderKey: 'hhmi', grantId: 'HHMI_Beta_B' }],
      '  HHMI_Beta_B  ',
    );
    expect(next).toEqual([]);
  });

  it('returns the same array reference when no HHMI grant matches', () => {
    const next = removeHhmiGrantByGrantId(grants, 'HHMI_Missing');
    expect(next).toBe(grants);
  });
});
