// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NIHJournalList } from './nih-journal.server.js';

// Mock the JSON import
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
      journalTitle: 'Journal of Biological Chemistry',
      nlmta: 'J Biol Chem',
      pissn: '0021-9258',
      eissn: '1083-351X',
      startDate: '2020-01-01',
    },
    {
      id: 5,
      journalTitle: 'PLOS ONE',
      nlmta: 'PLoS One',
      pissn: '1932-6203',
      startDate: '2020-01-01',
    },
  ],
};

// Mock the JSON import (path must match nih-journal.server.ts: ../../data/J_Entrez.json)
vi.mock('../../data/J_Entrez.json', () => ({
  default: mockNIHJournalList,
}));

// Import the functions after mocking
import {
  validateJournalAgainstNIH,
  searchNIHJournals,
  getNIHJournalById,
} from './nih-journal.server.js';

describe('NIH Journal Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateJournalAgainstNIH', () => {
    it('should validate a journal by exact name match', async () => {
      const result = await validateJournalAgainstNIH('Nature');

      expect(result.isValid).toBe(true);
      expect(result.journalMatch).toEqual(mockNIHJournalList.items[0]);
      expect(result.issn).toBe('1476-4687'); // Should prefer electronic ISSN
      expect(result.issnType).toBe('electronic');
    });

    it('should validate a journal by case-insensitive name match', async () => {
      const result = await validateJournalAgainstNIH('nature');

      expect(result.isValid).toBe(true);
      expect(result.journalMatch).toEqual(mockNIHJournalList.items[0]);
      expect(result.issn).toBe('1476-4687');
      expect(result.issnType).toBe('electronic');
    });

    it('should validate a journal by ISSN when name does not match', async () => {
      const result = await validateJournalAgainstNIH('Unknown Journal', '0028-0836');

      expect(result.isValid).toBe(true);
      expect(result.journalMatch).toEqual(mockNIHJournalList.items[0]);
      expect(result.issn).toBe('1476-4687'); // Should still prefer electronic ISSN
      expect(result.issnType).toBe('electronic');
    });

    it('should validate a journal by electronic ISSN when both are available', async () => {
      const result = await validateJournalAgainstNIH('Science', '0036-8075');

      expect(result.isValid).toBe(true);
      expect(result.journalMatch).toEqual(mockNIHJournalList.items[1]);
      expect(result.issn).toBe('1095-9203'); // Should prefer electronic ISSN
      expect(result.issnType).toBe('electronic');
    });

    it('should use print ISSN when electronic ISSN is not available', async () => {
      const result = await validateJournalAgainstNIH('PLOS ONE', '1932-6203');

      expect(result.isValid).toBe(true);
      expect(result.journalMatch).toEqual(mockNIHJournalList.items[4]);
      expect(result.issn).toBe('1932-6203'); // Should use print ISSN
      expect(result.issnType).toBe('print');
    });

    it('should handle ISSN with hyphens and spaces', async () => {
      const result = await validateJournalAgainstNIH('Unknown Journal', '0028-0836');

      expect(result.isValid).toBe(true);
      expect(result.journalMatch).toEqual(mockNIHJournalList.items[0]);
    });

    it('should return invalid for unknown journal without ISSN', async () => {
      const result = await validateJournalAgainstNIH('Unknown Journal');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Journal "Unknown Journal" is not found');
      expect(result.journalMatch).toBeUndefined();
      expect(result.issn).toBeUndefined();
      expect(result.issnType).toBeUndefined();
    });

    it('should return invalid for unknown journal with unknown ISSN', async () => {
      const result = await validateJournalAgainstNIH('Unknown Journal', '1234-5678');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Journal "Unknown Journal" is not found');
      expect(result.journalMatch).toBeUndefined();
      expect(result.issn).toBeUndefined();
      expect(result.issnType).toBeUndefined();
    });

    it('should handle journal names with extra whitespace', async () => {
      const result = await validateJournalAgainstNIH('  Nature  ');

      expect(result.isValid).toBe(true);
      expect(result.journalMatch).toEqual(mockNIHJournalList.items[0]);
    });

    it('should handle empty journal name', async () => {
      const result = await validateJournalAgainstNIH('');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Journal name or ISSN is required for validation');
    });

    it('should handle journal with only print ISSN', async () => {
      const result = await validateJournalAgainstNIH('PLOS ONE');

      expect(result.isValid).toBe(true);
      expect(result.journalMatch).toEqual(mockNIHJournalList.items[4]);
      expect(result.issn).toBe('1932-6203');
      expect(result.issnType).toBe('print');
    });
  });

  describe('searchNIHJournals', () => {
    it('should search journals by title', async () => {
      const results = await searchNIHJournals('Nature');

      expect(results).toHaveLength(1);
      expect(results[0].journalTitle).toBe('Nature');
    });

    it('should search journals by NLMTA', async () => {
      const results = await searchNIHJournals('J Biol Chem');

      expect(results).toHaveLength(1);
      expect(results[0].journalTitle).toBe('Journal of Biological Chemistry');
    });

    it('should return empty array for no matches', async () => {
      const results = await searchNIHJournals('Unknown Journal');

      expect(results).toHaveLength(0);
    });

    it('should return empty array for empty query', async () => {
      const results = await searchNIHJournals('');

      expect(results).toHaveLength(0);
    });

    it('should limit results', async () => {
      const results = await searchNIHJournals('Journal', 2);

      expect(results).toHaveLength(1); // Only "Journal of Biological Chemistry" matches
    });
  });

  describe('getNIHJournalById', () => {
    it('should get journal by valid ID', async () => {
      const journal = await getNIHJournalById(1);

      expect(journal).toEqual(mockNIHJournalList.items[0]);
    });

    it('should return null for invalid ID', async () => {
      const journal = await getNIHJournalById(999);

      expect(journal).toBeNull();
    });
  });
});
