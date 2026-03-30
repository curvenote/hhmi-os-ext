// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import type { NormalizedArticleRecord } from '../backend/types.js';
import {
  extractIssueTypes,
  extractIssueStatuses,
  generateIssueTypeFilters,
  generateIssueStatusFilters,
  generateAllPublicationFilters,
  generateCoveredPublicationFilters,
  generateBasicPublicationFilters,
  filterPublications,
  searchPublications,
  BASE_COMPLIANCE_FILTERS,
} from './PublicationListingHelpers.js';

describe('PublicationListingHelpers', () => {
  const mockPublications: NormalizedArticleRecord[] = [
    {
      id: '1',
      title: 'Test Publication 1',
      authors: ['John Doe', 'Jane Smith'],
      year: '2023',
      compliant: true,
      journal: {
        title: 'Test Journal 1',
        pmid: '1234567890',
        pmcid: '1234567890',
        doi: '10.1234/journal1',
        complianceIssueType: 'License Issue',
        complianceIssueStatus: 'Resolved',
      },
    },
    {
      id: '2',
      title: 'Test Publication 2',
      authors: ['Alice Brown'],
      year: '2023',
      compliant: false,
      preprint: {
        doi: '10.1234/preprint1',
        complianceIssueType: 'No Preprint',
        complianceIssueStatus: 'Open',
      },
    },
    {
      id: '3',
      title: 'Test Publication 3',
      authors: ['Bob Wilson'],
      year: '2022',
      compliant: true,
      journal: {},
    },
  ];

  describe('extractIssueTypes', () => {
    it('should extract unique issue types from both journal and preprint', () => {
      const issueTypes = extractIssueTypes(mockPublications);
      expect(issueTypes).toContain('License Issue');
      expect(issueTypes).toContain('No Preprint');
      expect(issueTypes).toHaveLength(2);
    });

    it('should return sorted issue types', () => {
      const issueTypes = extractIssueTypes(mockPublications);
      expect(issueTypes).toEqual(['License Issue', 'No Preprint']);
    });
  });

  describe('extractIssueStatuses', () => {
    it('should extract unique issue statuses from both journal and preprint', () => {
      const issueStatuses = extractIssueStatuses(mockPublications);
      expect(issueStatuses).toContain('Resolved');
      expect(issueStatuses).toContain('Open');
      expect(issueStatuses).toHaveLength(2);
    });
  });

  describe('generateIssueTypeFilters', () => {
    it('should generate filter definitions with counts', () => {
      const filters = generateIssueTypeFilters(mockPublications);
      const licenseFilter = filters.find((f) => f.value === 'License Issue');
      expect(licenseFilter).toBeDefined();
      expect(licenseFilter?.count).toBe(1);
    });

    it('should only include filters for publications with issue types', () => {
      const filters = generateIssueTypeFilters(mockPublications);
      // Should only have filters for actual issue types, not for missing ones
      expect(filters.length).toBe(2); // License Issue and No Preprint
      expect(filters.every((f) => f.value !== '__none__')).toBe(true);
    });
  });

  describe('generateIssueStatusFilters', () => {
    it('should generate filter definitions with counts', () => {
      const filters = generateIssueStatusFilters(mockPublications);
      expect(filters.length).toBeGreaterThan(0);
      const resolvedFilter = filters.find((f) => f.value === 'Resolved');
      expect(resolvedFilter?.count).toBe(1);
    });

    it('should only include filters for publications with issue statuses', () => {
      const filters = generateIssueStatusFilters(mockPublications);
      // Should only have filters for actual issue statuses, not for missing ones
      expect(filters.length).toBe(2); // Resolved and Open
      expect(filters.every((f) => f.value !== '__none__')).toBe(true);
    });
  });

  describe('generateAllPublicationFilters (deprecated)', () => {
    it('should place compliance filters first', () => {
      const allFilters = generateAllPublicationFilters(mockPublications);
      expect(allFilters.length).toBeGreaterThan(2);

      // First filters should be compliance filters
      expect(allFilters[0].key).toBe('compliance');
      expect(allFilters[0].value).toBe('compliant');
      expect(allFilters[1].key).toBe('compliance');
      expect(allFilters[1].value).toBe('with-issues');

      // Followed by issue type and status filters
      const issueTypeFilters = allFilters.filter((f) => f.key === 'issueType');
      const issueStatusFilters = allFilters.filter((f) => f.key === 'issueStatus');
      expect(issueTypeFilters.length).toBeGreaterThan(0);
      expect(issueStatusFilters.length).toBeGreaterThan(0);
    });
  });

  describe('generateCoveredPublicationFilters', () => {
    it('should include compliance filters at the start', () => {
      const filters = generateCoveredPublicationFilters(mockPublications);
      expect(filters.length).toBeGreaterThan(2);

      // First filters should be compliance filters
      expect(filters[0].key).toBe('compliance');
      expect(filters[0].value).toBe('compliant');
      expect(filters[1].key).toBe('compliance');
      expect(filters[1].value).toBe('with-issues');
    });

    it('should include issue type and status filters', () => {
      const filters = generateCoveredPublicationFilters(mockPublications);
      const issueTypeFilters = filters.filter((f) => f.key === 'issueType');
      const issueStatusFilters = filters.filter((f) => f.key === 'issueStatus');
      expect(issueTypeFilters.length).toBeGreaterThan(0);
      expect(issueStatusFilters.length).toBeGreaterThan(0);
    });
  });

  describe('generateBasicPublicationFilters', () => {
    it('should NOT include compliance filters', () => {
      const filters = generateBasicPublicationFilters(mockPublications);
      const complianceFilters = filters.filter((f) => f.key === 'compliance');
      expect(complianceFilters).toHaveLength(0);
    });

    it('should include issue type and status filters', () => {
      const filters = generateBasicPublicationFilters(mockPublications);
      const issueTypeFilters = filters.filter((f) => f.key === 'issueType');
      const issueStatusFilters = filters.filter((f) => f.key === 'issueStatus');
      expect(issueTypeFilters.length).toBeGreaterThan(0);
      expect(issueStatusFilters.length).toBeGreaterThan(0);
    });
  });

  describe('filterPublications', () => {
    it('should filter by compliance status', () => {
      const filters = BASE_COMPLIANCE_FILTERS;
      const activeFilters = { 'compliance-state': 'compliant' };
      const filtered = filterPublications(mockPublications, activeFilters, filters);
      expect(filtered).toHaveLength(2);
      expect(filtered.every((p) => p.compliant === true)).toBe(true);
    });

    it('should filter by with-issues status', () => {
      const filters = BASE_COMPLIANCE_FILTERS;
      const activeFilters = { 'compliance-state': 'with-issues' };
      const filtered = filterPublications(mockPublications, activeFilters, filters);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].compliant).toBe(false);
    });

    it('should return all publications when no filters are active', () => {
      const filters = BASE_COMPLIANCE_FILTERS;
      const activeFilters = {};
      const filtered = filterPublications(mockPublications, activeFilters, filters);
      expect(filtered).toHaveLength(3);
    });

    it('should filter by issue type', () => {
      const filters = generateIssueTypeFilters(mockPublications);
      // With groupKey, active filters use groupKey as key and value as value
      const activeFilters = { 'issue-types': 'License Issue' };
      const filtered = filterPublications(mockPublications, activeFilters, filters);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].journal?.complianceIssueType).toBe('License Issue');
    });

    it('should filter by preprint issue type', () => {
      const filters = generateIssueTypeFilters(mockPublications);
      // With groupKey, active filters use groupKey as key and value as value
      const activeFilters = { 'issue-types': 'No Preprint' };
      const filtered = filterPublications(mockPublications, activeFilters, filters);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].preprint?.complianceIssueType).toBe('No Preprint');
    });
  });

  describe('searchPublications', () => {
    it('should search by title', () => {
      const results = searchPublications(mockPublications, 'Publication 1');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Publication 1');
    });

    it('should search by author', () => {
      const results = searchPublications(mockPublications, 'Jane Smith');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('should search by DOI', () => {
      const results = searchPublications(mockPublications, '10.1234/journal1');
      expect(results).toHaveLength(1);
      expect(results[0].journal?.doi).toBe('10.1234/journal1');
    });

    it('should search by PMID', () => {
      const results = searchPublications(mockPublications, '12345');
      expect(results).toHaveLength(1);
      expect(results[0].journal?.pmid).toBe('1234567890');
    });

    it('should be case insensitive', () => {
      const results = searchPublications(mockPublications, 'JOHN DOE');
      expect(results).toHaveLength(1);
    });

    it('should be case insensitive for titles', () => {
      const results = searchPublications(mockPublications, 'TEST PUBLICATION 1');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('should be case insensitive for mixed case', () => {
      const results = searchPublications(mockPublications, 'TeSt PuBlIcAtIoN');
      expect(results).toHaveLength(3); // All have "Test Publication" in title
    });

    it('should return all publications when search is empty', () => {
      const results = searchPublications(mockPublications, '');
      expect(results).toHaveLength(3);
    });

    it('should return empty array when no matches', () => {
      const results = searchPublications(mockPublications, 'nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should search by journal issue status', () => {
      const results = searchPublications(mockPublications, 'Resolved');
      expect(results).toHaveLength(1);
      expect(results[0].journal?.complianceIssueStatus).toBe('Resolved');
    });

    it('should search by preprint issue status', () => {
      const results = searchPublications(mockPublications, 'Open');
      expect(results).toHaveLength(1);
      expect(results[0].preprint?.complianceIssueStatus).toBe('Open');
    });

    it('should search by journal issue type', () => {
      const results = searchPublications(mockPublications, 'License Issue');
      expect(results).toHaveLength(1);
      expect(results[0].journal?.complianceIssueType).toBe('License Issue');
    });

    it('should search by preprint issue type', () => {
      const results = searchPublications(mockPublications, 'No Preprint');
      expect(results).toHaveLength(1);
      expect(results[0].preprint?.complianceIssueType).toBe('No Preprint');
    });

    it('should be case insensitive for issue status', () => {
      const results = searchPublications(mockPublications, 'RESOLVED');
      expect(results).toHaveLength(1);
      expect(results[0].journal?.complianceIssueStatus).toBe('Resolved');
    });

    it('should be case insensitive for issue type', () => {
      const results = searchPublications(mockPublications, 'license issue');
      expect(results).toHaveLength(1);
      expect(results[0].journal?.complianceIssueType).toBe('License Issue');
    });

    it('should support partial matching for issue status', () => {
      const results = searchPublications(mockPublications, 'Res');
      expect(results).toHaveLength(1);
      expect(results[0].journal?.complianceIssueStatus).toBe('Resolved');
    });

    it('should support partial matching for issue type', () => {
      const results = searchPublications(mockPublications, 'License');
      expect(results).toHaveLength(1);
      expect(results[0].journal?.complianceIssueType).toBe('License Issue');
    });
  });
});
