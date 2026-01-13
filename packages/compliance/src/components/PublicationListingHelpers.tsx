import { ui, usePingEvent } from '@curvenote/scms-core';
import type { NormalizedArticleRecord } from '../backend/types.js';
import { HHMITrackEvent } from '../analytics/events.js';
import { useCallback } from 'react';

// HHMI Publication-specific client search component
export interface HHMIPublicationSearchProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  placeholder?: string;
}

export function HHMIPublicationSearch({
  searchTerm,
  onSearchChange,
  placeholder = 'Search publications by title, author, DOI, issue status, issue type...',
}: HHMIPublicationSearchProps) {
  const handleSearchChange = useCallback(
    (term: string) => {
      onSearchChange(term);
    },
    [onSearchChange],
  );

  return (
    <ui.ClientQuerySearch
      className="my-3"
      searchTerm={searchTerm}
      onSearchChange={handleSearchChange}
      placeholder={placeholder}
      resultLabel="publication"
    />
  );
}

// HHMI Publication-specific client filter bar component
export interface HHMIPublicationFilterBarProps {
  items: NormalizedArticleRecord[] | Promise<NormalizedArticleRecord[]>;
  activeFilters: Record<string, any>;
  setActiveFilters: (filters: Record<string, any>) => void;
  filters: ui.FilterDefinition[];
}

/**
 * Extract unique issue types from publications
 * Checks both journal and preprint fields
 */
export function extractIssueTypes(publications: NormalizedArticleRecord[]): string[] {
  const issueTypes = new Set<string>();

  publications.forEach((pub) => {
    if (pub.journal?.complianceIssueType) {
      issueTypes.add(pub.journal.complianceIssueType);
    }
    if (pub.preprint?.complianceIssueType) {
      issueTypes.add(pub.preprint.complianceIssueType);
    }
  });

  return [...Array.from(issueTypes)].sort();
}

/**
 * Extract unique issue statuses from publications
 * Checks both journal and preprint fields
 */
export function extractIssueStatuses(publications: NormalizedArticleRecord[]): string[] {
  const issueStatuses = new Set<string>();

  publications.forEach((pub) => {
    if (pub.journal?.complianceIssueStatus) {
      issueStatuses.add(pub.journal.complianceIssueStatus);
    }
    if (pub.preprint?.complianceIssueStatus) {
      issueStatuses.add(pub.preprint.complianceIssueStatus);
    }
  });

  return [...Array.from(issueStatuses)].sort();
}

/**
 * Generates dynamic filter definitions for issue types from publications.
 * @param publications - Array of normalized article records
 * @returns Array of filter definitions for issue types
 */
export function generateIssueTypeFilters(
  publications: NormalizedArticleRecord[],
): ui.FilterDefinition[] {
  const issueTypes = extractIssueTypes(publications);

  const filters: ui.FilterDefinition[] = issueTypes.map((issueType) => {
    const count = publications.filter(
      (pub) =>
        pub.journal?.complianceIssueType === issueType ||
        pub.preprint?.complianceIssueType === issueType,
    ).length;

    return {
      key: 'issueType',
      value: issueType,
      label: issueType,
      count,
      groupKey: 'issue-types',
    };
  });

  return filters;
}

/**
 * Generates dynamic filter definitions for issue statuses from publications.
 * @param publications - Array of normalized article records
 * @returns Array of filter definitions for issue statuses
 */
export function generateIssueStatusFilters(
  publications: NormalizedArticleRecord[],
): ui.FilterDefinition[] {
  const issueStatuses = extractIssueStatuses(publications);

  const filters: ui.FilterDefinition[] = issueStatuses.map((issueStatus) => {
    const count = publications.filter(
      (pub) =>
        pub.journal?.complianceIssueStatus === issueStatus ||
        pub.preprint?.complianceIssueStatus === issueStatus,
    ).length;

    return {
      key: 'issueStatus',
      value: issueStatus,
      label: issueStatus,
      count,
      groupKey: 'issue-statuses',
    };
  });

  return filters;
}

/**
 * Base compliance filter definitions (static)
 * These are mutually exclusive using groupKey
 * Note: "All" option is automatically added by ClientFilterBar
 */
export const BASE_COMPLIANCE_FILTERS: ui.FilterDefinition[] = [
  {
    key: 'compliance',
    value: 'compliant',
    label: 'Compliant',
    groupKey: 'compliance-state',
  },
  {
    key: 'compliance',
    value: 'non-compliant',
    label: 'Non-Compliant',
    groupKey: 'compliance-state',
  },
];

/**
 * Generates filter definitions for covered publications (compliance report).
 * Combines static compliance filters with dynamic issue type/status filters.
 * @param publications - Array of normalized article records
 * @returns Array of filter definitions
 */
export function generateCoveredPublicationFilters(
  publications: NormalizedArticleRecord[],
): ui.FilterDefinition[] {
  const issueTypeFilters = generateIssueTypeFilters(publications);
  const issueStatusFilters = generateIssueStatusFilters(publications);

  return [...BASE_COMPLIANCE_FILTERS, ...issueTypeFilters, ...issueStatusFilters];
}

/**
 * Generates filter definitions for basic publications (without compliance filters).
 * Only includes dynamic issue type/status filters.
 * @param publications - Array of normalized article records
 * @returns Array of filter definitions
 */
export function generateBasicPublicationFilters(
  publications: NormalizedArticleRecord[],
): ui.FilterDefinition[] {
  const issueTypeFilters = generateIssueTypeFilters(publications);
  const issueStatusFilters = generateIssueStatusFilters(publications);

  return [...issueTypeFilters, ...issueStatusFilters];
}

/**
 * @deprecated Use generateCoveredPublicationFilters or generateBasicPublicationFilters instead
 * Generate all filter definitions from publications data
 * Combines static compliance filters with dynamic issue type/status filters
 */
export function generateAllPublicationFilters(
  publications: NormalizedArticleRecord[],
): ui.FilterDefinition[] {
  return generateCoveredPublicationFilters(publications);
}

/**
 * Type definition for publication-specific filter functions
 */
type PublicationFilterFunction = (
  publication: NormalizedArticleRecord,
  filterValue: any,
) => boolean;

/**
 * Field-specific filter implementations for publications
 */
const publicationFilterFunctions: Record<string, PublicationFilterFunction> = {
  /**
   * Compliance filtering based on compliant field
   * Note: compliant can be true, false, or undefined
   */
  compliance: (publication, value) => {
    switch (value) {
      case 'compliant':
        return publication.compliant === true;
      case 'non-compliant':
        // Check for "not true" to catch both false and undefined
        return publication.compliant !== true;
      default:
        return true;
    }
  },

  /**
   * Issue type filtering - checks both journal and preprint
   */
  issueType: (publication, value) => {
    if (value === '__none__') {
      return (
        !publication.journal?.complianceIssueType && !publication.preprint?.complianceIssueType
      );
    }
    return (
      publication.journal?.complianceIssueType === value ||
      publication.preprint?.complianceIssueType === value
    );
  },

  /**
   * Issue status filtering - checks both journal and preprint
   */
  issueStatus: (publication, value) => {
    if (value === '__none__') {
      return (
        !publication.journal?.complianceIssueStatus && !publication.preprint?.complianceIssueStatus
      );
    }
    return (
      publication.journal?.complianceIssueStatus === value ||
      publication.preprint?.complianceIssueStatus === value
    );
  },
};

/**
 * Filters publications based on active filter definitions.
 * @param publications - Array of normalized article records to filter
 * @param activeFilters - Object containing active filter values
 * @param filters - Array of filter definitions
 * @returns Filtered array of publications
 */
export function filterPublications(
  publications: NormalizedArticleRecord[],
  activeFilters: Record<string, any>,
  filters: ui.FilterDefinition[],
): NormalizedArticleRecord[] {
  // If "All" is explicitly selected, return all items unfiltered
  if (ui.isAllFiltersActive(activeFilters)) {
    return publications;
  }

  return publications.filter((publication) => {
    // For each filter definition, check if it should filter this publication
    return filters.every((filter) => {
      // Check if this filter is currently active
      if (!ui.isFilterActive(activeFilters, filter)) {
        return true; // If filter is not active, don't filter out the item
      }

      // Get the field-specific filter function
      const filterFunction = publicationFilterFunctions[filter.key];
      if (!filterFunction) {
        console.warn(`No filter function found for key: ${filter.key}`);
        return true; // Default to not filtering if no function is found
      }

      // Apply the filter function with the filter's value
      return filterFunction(publication, filter.value);
    });
  });
}

/**
 * Searches publications by title, authors, DOI, PMID, PMCID, issue status, and issue type.
 * @param publications - Array of normalized article records to search
 * @param searchTerm - Search term to match against
 * @returns Filtered array of publications matching the search term
 */
export function searchPublications(
  publications: NormalizedArticleRecord[],
  searchTerm: string,
): NormalizedArticleRecord[] {
  if (!searchTerm.trim()) {
    return publications;
  }

  const searchLower = searchTerm.toLowerCase();

  return publications.filter((pub) => {
    // Search title
    if (pub.title?.toLowerCase().includes(searchLower)) {
      return true;
    }

    // Search authors
    if (pub.authors?.some((author) => author.toLowerCase().includes(searchLower))) {
      return true;
    }

    // Search journal DOI
    if (pub.journal?.doi?.toLowerCase().includes(searchLower)) {
      return true;
    }

    // Search preprint DOI
    if (pub.preprint?.doi?.toLowerCase().includes(searchLower)) {
      return true;
    }

    // Search PMID
    if (pub.journal?.pmid?.toLowerCase().includes(searchLower)) {
      return true;
    }

    // Search PMCID
    if (pub.journal?.pmcid?.toLowerCase().includes(searchLower)) {
      return true;
    }

    // Search journal issue status
    if (pub.journal?.complianceIssueStatus?.toLowerCase().includes(searchLower)) {
      return true;
    }

    // Search preprint issue status
    if (pub.preprint?.complianceIssueStatus?.toLowerCase().includes(searchLower)) {
      return true;
    }

    // Search journal issue type
    if (pub.journal?.complianceIssueType?.toLowerCase().includes(searchLower)) {
      return true;
    }

    // Search preprint issue type
    if (pub.preprint?.complianceIssueType?.toLowerCase().includes(searchLower)) {
      return true;
    }

    // Search licenses
    if (pub.journal?.license?.toLowerCase().includes(searchLower)) {
      return true;
    }

    if (pub.preprint?.license?.toLowerCase().includes(searchLower)) {
      return true;
    }

    return false;
  });
}

export function HHMIPublicationFilterBar({
  items,
  activeFilters,
  setActiveFilters,
  filters,
}: HHMIPublicationFilterBarProps) {
  const pingEvent = usePingEvent();

  const handleFilterChange = useCallback(
    (newFilters: Record<string, any>) => {
      setActiveFilters(newFilters);
      const activeFilterCount = Object.values(newFilters).filter(Boolean).length;
      if (activeFilterCount > 0) {
        pingEvent(
          HHMITrackEvent.HHMI_COMPLIANCE_FILTER_APPLIED,
          {
            activeFilters: newFilters,
            filterCount: activeFilterCount,
            filterType: 'publications',
          },
          { anonymous: true },
        );
      }
    },
    [setActiveFilters, pingEvent],
  );

  // Custom count function that uses our filter logic
  const customCountFunction = useCallback(
    (publications: NormalizedArticleRecord[], filter: ui.FilterDefinition) => {
      const filterFunction = publicationFilterFunctions[filter.key];
      if (!filterFunction) {
        return 0;
      }
      return publications.filter((pub) => filterFunction(pub, filter.value)).length;
    },
    [],
  );

  return (
    <ui.ClientFilterBarWithAdvanced
      items={items}
      filters={filters}
      activeFilters={activeFilters}
      setActiveFilters={handleFilterChange}
      customCountFunction={customCountFunction}
      basicFilterKeys={['compliance']}
      advancedFilterKeys={['issueType', 'issueStatus']}
    />
  );
}
