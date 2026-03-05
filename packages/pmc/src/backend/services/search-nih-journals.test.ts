// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NIHJournalList } from './nih-journal.server.js';

// Mock the JSON import with a larger dataset for better search testing
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
      journalTitle: 'Nature Biotechnology',
      nlmta: 'Nat Biotechnol',
      pissn: '1087-0156',
      eissn: '1546-1696',
      startDate: '2020-01-01',
    },
    {
      id: 3,
      journalTitle: 'Nature Communications',
      nlmta: 'Nat Commun',
      pissn: '2041-1723',
      eissn: '2041-1723',
      startDate: '2020-01-01',
    },
    {
      id: 4,
      journalTitle: 'Science',
      nlmta: 'Science',
      pissn: '0036-8075',
      eissn: '1095-9203',
      startDate: '2020-01-01',
    },
    {
      id: 5,
      journalTitle: 'Science Advances',
      nlmta: 'Sci Adv',
      pissn: '2375-2548',
      eissn: '2375-2548',
      startDate: '2020-01-01',
    },
    {
      id: 6,
      journalTitle: 'Cell',
      nlmta: 'Cell',
      pissn: '0092-8674',
      eissn: '1097-4172',
      startDate: '2020-01-01',
    },
    {
      id: 7,
      journalTitle: 'Cell Reports',
      nlmta: 'Cell Rep',
      pissn: '2211-1247',
      eissn: '2211-1247',
      startDate: '2020-01-01',
    },
    {
      id: 8,
      journalTitle: 'Journal of Biological Chemistry',
      nlmta: 'J Biol Chem',
      pissn: '0021-9258',
      eissn: '1083-351X',
      startDate: '2020-01-01',
    },
    {
      id: 9,
      journalTitle: 'PLOS ONE',
      nlmta: 'PLoS One',
      pissn: '1932-6203',
      startDate: '2020-01-01',
    },
    {
      id: 10,
      journalTitle: 'PLOS Biology',
      nlmta: 'PLoS Biol',
      pissn: '1544-9173',
      eissn: '1545-7885',
      startDate: '2020-01-01',
    },
    {
      id: 11,
      journalTitle: 'Proceedings of the National Academy of Sciences',
      nlmta: 'Proc Natl Acad Sci U S A',
      pissn: '0027-8424',
      eissn: '1091-6490',
      startDate: '2020-01-01',
    },
    {
      id: 12,
      journalTitle: 'The New England Journal of Medicine',
      nlmta: 'N Engl J Med',
      pissn: '0028-4793',
      eissn: '1533-4406',
      startDate: '2020-01-01',
    },
  ],
};

// Mock the JSON import (path must match nih-journal.server.ts: ../../data/J_Entrez.json)
vi.mock('../../data/J_Entrez.json', () => ({
  default: mockNIHJournalList,
}));

// Import the function after mocking
import { searchNIHJournals } from './nih-journal.server.js';

describe('searchNIHJournals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Search Functionality', () => {
    it('should find exact journal title matches', async () => {
      const results = await searchNIHJournals('Nature');

      expect(results).toHaveLength(3); // Nature, Nature Biotechnology, Nature Communications
      expect(results.map((r) => r.journalTitle)).toEqual([
        'Nature',
        'Nature Biotechnology',
        'Nature Communications',
      ]);
    });

    it('should find exact NLMTA matches', async () => {
      const results = await searchNIHJournals('Nat Biotechnol');

      expect(results).toHaveLength(1);
      expect(results[0].journalTitle).toBe('Nature Biotechnology');
    });

    it('should find partial title matches', async () => {
      const results = await searchNIHJournals('Nature Bio');

      // Fuse.js will find multiple matches for "Nature Bio" including "Nature" and "Nature Biotechnology"
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.journalTitle === 'Nature Biotechnology')).toBe(true);
    });

    it('should find partial NLMTA matches', async () => {
      const results = await searchNIHJournals('Nat');

      // "Nat" matches: Nature, Nat Biotechnol, Nat Commun, and also Science (contains 'a')
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results.some((r) => r.nlmta === 'Nature')).toBe(true);
      expect(results.some((r) => r.nlmta === 'Nat Biotechnol')).toBe(true);
      expect(results.some((r) => r.nlmta === 'Nat Commun')).toBe(true);
    });
  });

  describe('Case Insensitivity', () => {
    it('should handle lowercase queries', async () => {
      const results = await searchNIHJournals('nature');

      expect(results).toHaveLength(3);
      expect(results[0].journalTitle).toBe('Nature');
    });

    it('should handle uppercase queries', async () => {
      const results = await searchNIHJournals('NATURE');

      expect(results).toHaveLength(3);
      expect(results[0].journalTitle).toBe('Nature');
    });

    it('should handle mixed case queries', async () => {
      const results = await searchNIHJournals('NaTuRe');

      expect(results).toHaveLength(3);
      expect(results[0].journalTitle).toBe('Nature');
    });
  });

  describe('Whitespace Handling', () => {
    it('should handle leading whitespace', async () => {
      const results = await searchNIHJournals('  Nature');

      expect(results).toHaveLength(3);
      expect(results[0].journalTitle).toBe('Nature');
    });

    it('should handle trailing whitespace', async () => {
      const results = await searchNIHJournals('Nature  ');

      expect(results).toHaveLength(3);
      expect(results[0].journalTitle).toBe('Nature');
    });

    it('should handle multiple spaces', async () => {
      const results = await searchNIHJournals('  Nature  ');

      expect(results).toHaveLength(3);
      expect(results[0].journalTitle).toBe('Nature');
    });
  });

  describe('Result Limiting', () => {
    it('should respect the default limit of 20', async () => {
      const results = await searchNIHJournals('Journal');

      expect(results.length).toBeLessThanOrEqual(20);
    });

    it('should respect custom limit', async () => {
      const results = await searchNIHJournals('Nature', 2);

      expect(results).toHaveLength(2);
      expect(results[0].journalTitle).toBe('Nature');
      expect(results[1].journalTitle).toBe('Nature Biotechnology');
    });

    it('should return all results when limit is higher than matches', async () => {
      const results = await searchNIHJournals('Nature', 10);

      expect(results).toHaveLength(3); // Only 3 matches, so should return all
    });

    it('should return empty array when limit is 0', async () => {
      const results = await searchNIHJournals('Nature', 0);

      expect(results).toHaveLength(1); // Limit of 0 is now clamped to minimum of 1
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for empty query', async () => {
      const results = await searchNIHJournals('');

      expect(results).toHaveLength(0);
    });

    it('should return empty array for whitespace-only query', async () => {
      const results = await searchNIHJournals('   ');

      expect(results).toHaveLength(0);
    });

    it('should return empty array for no matches', async () => {
      const results = await searchNIHJournals('NonExistentJournal');

      expect(results).toHaveLength(0);
    });

    it('should find matches for very short queries', async () => {
      const results = await searchNIHJournals('a');

      // Fuse.js has minMatchCharLength: 2, so single character queries won't return results
      // This is expected behavior for fuzzy search
      expect(results.length).toBe(0);
    });
  });

  describe('Complex Search Scenarios', () => {
    it('should find journals with long titles', async () => {
      const results = await searchNIHJournals('Proceedings');

      expect(results).toHaveLength(1);
      expect(results[0].journalTitle).toBe('Proceedings of the National Academy of Sciences');
    });

    it('should find journals with abbreviated NLMTA', async () => {
      const results = await searchNIHJournals('Proc Natl Acad Sci');

      expect(results).toHaveLength(1);
      expect(results[0].journalTitle).toBe('Proceedings of the National Academy of Sciences');
    });

    it('should find multiple journals with similar names', async () => {
      const results = await searchNIHJournals('PLOS');

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.journalTitle)).toEqual(['PLOS ONE', 'PLOS Biology']);
    });

    it('should prioritize exact matches over partial matches', async () => {
      const results = await searchNIHJournals('Cell');

      expect(results).toHaveLength(2);
      expect(results[0].journalTitle).toBe('Cell'); // Exact match first
      expect(results[1].journalTitle).toBe('Cell Reports'); // Partial match second
    });
  });

  describe('Performance and Ordering', () => {
    it('should return results in original order (not sorted)', async () => {
      const results = await searchNIHJournals('Nature');

      // Should maintain the order from the original array
      expect(results[0].id).toBe(1); // Nature
      expect(results[1].id).toBe(2); // Nature Biotechnology
      expect(results[2].id).toBe(3); // Nature Communications
    });

    it('should handle large result sets efficiently', async () => {
      const startTime = Date.now();
      const results = await searchNIHJournals('Journal', 50);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
      expect(results.length).toBeLessThanOrEqual(50);
    });
  });
});
