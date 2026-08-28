// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHHMIGrantOptions, getHHMIScientistByGrantId } from './hhmi-grants.server.js';

vi.mock('@curvenote/scms-server', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getPrismaClient: vi.fn(),
    safeObjectDataUpdate: vi.fn(),
  };
});

const mockFindFirst = vi.fn();

beforeEach(async () => {
  mockFindFirst.mockReset();
  const { getPrismaClient } = await import('@curvenote/scms-server');
  vi.mocked(getPrismaClient).mockResolvedValue({
    object: { findFirst: mockFindFirst },
  } as any);
});

describe('getHHMIGrantOptions', () => {
  it('includes grant id in combobox description without email', async () => {
    mockFindFirst.mockResolvedValue({
      data: {
        scientists: [
          {
            id: 'rec1',
            fullName: 'Alex Alpha',
            firstName: 'Alex',
            lastName: 'Alpha',
            email: 'alex.alpha@example.com',
            grantId: 'GRANT_Alpha_A',
            orcid: '',
          },
        ],
      },
    });

    const options = await getHHMIGrantOptions();

    expect(options).toEqual([
      {
        value: 'GRANT_Alpha_A',
        label: 'Alex Alpha',
        description: 'GRANT_Alpha_A',
      },
    ]);
  });

  it('emits trimmed grant ids as option values', async () => {
    mockFindFirst.mockResolvedValue({
      data: {
        scientists: [
          {
            id: 'rec2',
            fullName: 'Padded Id',
            firstName: 'Padded',
            lastName: 'Id',
            email: 'padded@example.com',
            grantId: '  GRANT_Padded  ',
            orcid: '',
          },
        ],
      },
    });

    const options = await getHHMIGrantOptions();
    expect(options[0]?.value).toBe('GRANT_Padded');
    expect(options[0]?.description).toBe('GRANT_Padded');
  });

  it('still returns grant id when email is missing', async () => {
    mockFindFirst.mockResolvedValue({
      data: {
        scientists: [
          {
            id: 'rec2',
            fullName: 'No Email Investigator',
            firstName: 'No',
            lastName: 'Email',
            email: '',
            grantId: 'GRANT_No_Email',
            orcid: '',
          },
        ],
      },
    });

    const options = await getHHMIGrantOptions();

    expect(options[0]?.description).toBe('GRANT_No_Email');
  });
});

describe('getHHMIScientistByGrantId', () => {
  it('matches when Airtable grantId has surrounding whitespace', async () => {
    mockFindFirst.mockResolvedValue({
      data: {
        scientists: [
          {
            id: 'rec1',
            fullName: 'Alex Alpha',
            firstName: 'Alex',
            lastName: 'Alpha',
            email: 'alex.alpha@example.com',
            grantId: '  GRANT_Alpha_A  ',
            orcid: '',
          },
        ],
      },
    });

    const scientist = await getHHMIScientistByGrantId('GRANT_Alpha_A');
    expect(scientist?.fullName).toBe('Alex Alpha');
  });

  it('matches when the lookup argument is untrimmed', async () => {
    mockFindFirst.mockResolvedValue({
      data: {
        scientists: [
          {
            id: 'rec1',
            fullName: 'Alex Alpha',
            firstName: 'Alex',
            lastName: 'Alpha',
            email: 'alex.alpha@example.com',
            grantId: 'GRANT_Alpha_A',
            orcid: '',
          },
        ],
      },
    });

    const scientist = await getHHMIScientistByGrantId('  GRANT_Alpha_A  ');
    expect(scientist?.grantId).toBe('GRANT_Alpha_A');
  });
});
