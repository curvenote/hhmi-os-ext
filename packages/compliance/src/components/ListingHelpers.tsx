import { ui } from '@curvenote/scms-core';

// Compliance-specific helper types and functions
export interface ComplianceFilterBarProps {
  totalScientists: number;
  nonCompliantCount: number;
  compliantCount: number;
  zeroPublicationsCount: number;
  hasOrcidCount: number;
  parseQuery: (qValue: string) => any;
  buildQuery: (query: any) => string;
}

export function ComplianceFilterBar({
  totalScientists,
  nonCompliantCount,
  compliantCount,
  zeroPublicationsCount,
  hasOrcidCount,
  parseQuery,
  buildQuery,
}: ComplianceFilterBarProps) {
  const filters: ui.FilterDefinition[] = [
    { key: 'compliance', value: 'non-compliant', label: 'Non-Compliant', count: nonCompliantCount },
    { key: 'compliance', value: 'compliant', label: 'Compliant', count: compliantCount },
    { key: 'compliance', value: 'zero', label: 'Zero Publications', count: zeroPublicationsCount },
    { key: 'orcid', value: true, label: 'Has ORCID', count: hasOrcidCount },
  ];

  const isFilterActive = (query: any, key: string, value: any) => {
    const currentValue = query[key];

    // Handle boolean comparisons more robustly
    if (typeof value === 'boolean') {
      return currentValue === value || currentValue === value.toString();
    }

    return currentValue === value;
  };

  const updateQuery = (currentQuery: any, key: string, value: any) => {
    if (currentQuery[key] === value) {
      // Remove the filter
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [key]: _, ...rest } = currentQuery;
      return rest;
    } else {
      // Add the filter
      return { ...currentQuery, [key]: value };
    }
  };

  const clearFilters = (currentQuery: any) => {
    // Preserve search term if it exists
    return currentQuery.search ? { search: currentQuery.search } : {};
  };

  const hasActiveFilters = (query: any) => {
    return Object.keys(query).some((key) => key !== 'search');
  };

  return (
    <ui.FilterBar
      filters={filters}
      parseQuery={parseQuery}
      buildQuery={buildQuery}
      isFilterActive={isFilterActive}
      updateQuery={updateQuery}
      clearFilters={clearFilters}
      hasActiveFilters={hasActiveFilters}
      totalCount={totalScientists}
    />
  );
}

// Scientists-specific search component
export interface ScientistSearchProps {
  searchTerm?: string;
  resultCount: number;
  debounceMs?: number;
  parseQuery: (qValue: string) => any;
  buildQuery: (query: any) => string;
}

export function ScientistSearch({
  searchTerm,
  resultCount,
  debounceMs = 300,
  parseQuery,
  buildQuery,
}: ScientistSearchProps) {
  const updateQuerySearch = (query: any, searchValue: string | undefined) => {
    if (searchValue === undefined) {
      // Remove search from query
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { search: _, ...rest } = query;
      return rest;
    } else {
      // Add/update search in query
      return { ...query, search: searchValue };
    }
  };

  return (
    <ui.QuerySearch
      searchTerm={searchTerm}
      resultCount={resultCount}
      placeholder="Search scientists by name..."
      resultLabel="scientist"
      debounceMs={debounceMs}
      parseQuery={parseQuery}
      buildQuery={buildQuery}
      updateQuerySearch={updateQuerySearch}
    />
  );
}

/**
 * Summarizes an author list, showing first and last author with count for long lists.
 * @param authors - Array of author names
 * @returns Formatted author string or React node
 */
export function summarizeAuthorList(authors?: string[]) {
  if (!authors) return '';
  if (authors.length < 5) return authors.join(', ');
  return (
    <span>
      {authors[0]}
      {', '}
      <span className="italic text-muted-foreground">+{authors.length - 2} more authors...</span>
      {', '}
      {authors[authors.length - 1]}
    </span>
  );
}
