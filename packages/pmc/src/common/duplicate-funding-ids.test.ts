// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import type { HHMIScientist } from '../backend/hhmi-grants.server.js';
import { classifyDuplicateGrantGroups } from './duplicate-funding-ids.js';

function scientist(overrides: Partial<HHMIScientist> & Pick<HHMIScientist, 'id'>): HHMIScientist {
  return {
    fullName: '',
    firstName: '',
    lastName: '',
    email: '',
    grantId: '',
    orcid: '',
    ...overrides,
  };
}

describe('classifyDuplicateGrantGroups', () => {
  it('returns empty when all funding ids are unique', () => {
    const result = classifyDuplicateGrantGroups([
      scientist({ id: '1', grantId: 'HHMI_A', fullName: 'Alex' }),
      scientist({ id: '2', grantId: 'HHMI_B', fullName: 'Blair' }),
    ]);
    expect(result).toEqual({ unresolved: [], resolved: [] });
  });

  it('ignores empty funding ids', () => {
    const result = classifyDuplicateGrantGroups([
      scientist({ id: '1', grantId: '  ', fullName: 'Alex' }),
      scientist({ id: '2', grantId: '', fullName: 'Blair' }),
    ]);
    expect(result).toEqual({ unresolved: [], resolved: [] });
  });

  it('classifies as resolved when duplicate grant ids have distinct names', () => {
    const a = scientist({
      id: '1',
      grantId: 'HHMI_Chen_J',
      fullName: 'Alex Alpha',
      firstName: 'Alex',
      lastName: 'Alpha',
      email: 'alex@example.com',
    });
    const b = scientist({
      id: '2',
      grantId: '  HHMI_Chen_J  ',
      fullName: 'Jordan Chen',
      firstName: 'Jordan',
      lastName: 'Chen',
      email: 'jordan@example.com',
    });

    const result = classifyDuplicateGrantGroups([a, b]);

    expect(result.unresolved).toEqual([]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]?.grantId).toBe('HHMI_Chen_J');
    expect(result.resolved[0]?.scientists.map((s) => s.id)).toEqual(['1', '2']);
  });

  it('classifies as unresolved when a duplicate group has a blank name', () => {
    const result = classifyDuplicateGrantGroups([
      scientist({ id: '1', grantId: 'HHMI_X', fullName: 'Alex' }),
      scientist({ id: '2', grantId: 'HHMI_X', fullName: '  ' }),
    ]);

    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]?.grantId).toBe('HHMI_X');
  });

  it('classifies as unresolved when normalized names collide', () => {
    const result = classifyDuplicateGrantGroups([
      scientist({ id: '1', grantId: 'HHMI_Y', fullName: 'Alex Alpha' }),
      scientist({ id: '2', grantId: 'HHMI_Y', fullName: '  alex   alpha  ' }),
    ]);

    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]?.scientists).toHaveLength(2);
  });
});
