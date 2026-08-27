import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHHMIGrantOptions } from './hhmi-grants.server.js';

vi.mock('@curvenote/scms-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@curvenote/scms-server')>();
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
  it('includes grant id and email in combobox description', async () => {
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
        description: 'GRANT_Alpha_A · alex.alpha@example.com',
        email: 'alex.alpha@example.com',
      },
    ]);
  });

  it('notes when email is missing', async () => {
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

    expect(options[0]?.description).toBe('GRANT_No_Email · Email not available');
    expect(options[0]?.email).toBe('');
  });
});
