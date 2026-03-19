// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NIHJournalList } from '../src/backend/services/nih-journal.server.js';

const mockNIHJournalList: NIHJournalList = {
  source: 'test',
  date: '2024-01-01',
  items: [
    {
      id: 1,
      journalTitle: 'Nature',
      nlmta: 'Nature',
      pissn: '0028-0836',
      eissn: '1476-4687',
      startDate: '2020-01-01',
    },
    {
      id: 2,
      journalTitle: 'Science',
      nlmta: 'Science',
      pissn: '0036-8075',
      eissn: '1095-9203',
      startDate: '2020-01-01',
    },
    {
      id: 3,
      journalTitle: 'Cell',
      nlmta: 'Cell',
      pissn: '0092-8674',
      eissn: '1097-4172',
      startDate: '2020-01-01',
    },
    {
      id: 4,
      journalTitle: 'PLOS ONE',
      nlmta: 'PLoS One',
      pissn: '1932-6203',
      startDate: '2020-01-01',
    },
    {
      id: 5,
      journalTitle: 'Journal of Biological Chemistry',
      nlmta: 'J Biol Chem',
      pissn: '0021-9258',
      eissn: '1083-351X',
      startDate: '2020-01-01',
    },
  ],
};

vi.mock('../src/data/J_Entrez.json', () => ({
  default: mockNIHJournalList,
}));

import { getNIHJournalById } from '../src/backend/services/nih-journal.server.js';

describe('getNIHJournalById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the correct journal for a valid ID', async () => {
    const journal = await getNIHJournalById(1);
    expect(journal).toEqual(mockNIHJournalList.items[0]);
  });

  it('should return the correct journal for the highest valid ID', async () => {
    const journal = await getNIHJournalById(5);
    expect(journal).toEqual(mockNIHJournalList.items[4]);
  });

  it('should return null for an invalid ID', async () => {
    const journal = await getNIHJournalById(999);
    expect(journal).toBeNull();
  });

  it('should return null for a negative ID', async () => {
    const journal = await getNIHJournalById(-1);
    expect(journal).toBeNull();
  });

  it('should return null for zero as ID', async () => {
    const journal = await getNIHJournalById(0);
    expect(journal).toBeNull();
  });
});
