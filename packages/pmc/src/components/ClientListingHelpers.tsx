import { ui } from '@curvenote/scms-core';
import type { SubmissionWithVersionsDBO } from '@curvenote/scms-server';
import type { ResolvedListing } from '../routes/$siteName.inbox/types.js';

// Status values that require admin attention
export const NEEDS_ATTENTION_STATUSES = [
  'PENDING',
  'FAILED',
  'DEPOSIT_FAILED',
  'DEPOSIT_REJECTED_BY_PMC',
  'REVIEWER_REJECTED_INITIAL',
];

// PMC-specific client search component
export interface PMCClientSearchProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  placeholder?: string;
}

export function PMCClientSearch({
  searchTerm,
  onSearchChange,
  placeholder = 'Filter by title, journal, submitter, DOI, NIHMSID, PMID, PMCID...',
}: PMCClientSearchProps) {
  return (
    <ui.ClientQuerySearch
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
      placeholder={placeholder}
      resultLabel="submission"
    />
  );
}

// PMC-specific client filter bar component
export interface PMCClientFilterBarProps {
  items: SubmissionWithVersionsDBO[] | Promise<SubmissionWithVersionsDBO[]>;
  activeFilters: Record<string, any>;
  setActiveFilters: (filters: Record<string, any>) => void;
}

/**
 * PMC filter definitions for submission status filtering.
 *
 * Both filters are independent and can be active simultaneously.
 * "Needs attention" is active by default to highlight submissions requiring action.
 */
export const PMC_FILTERS: ui.FilterDefinition[] = [
  {
    groupKey: 'status',
    key: 'status',
    value: 'needs-attention',
    label: 'Needs your attention',
    default: true,
  },
  {
    groupKey: 'status',
    key: 'status',
    value: 'pending',
    label: 'Not submitted yet',
  },
  {
    groupKey: 'status',
    key: 'status',
    value: 'request_new_version',
    label: 'New Version Requested',
  },
];

/**
 * Type definition for submission-specific filter functions.
 */
type SubmissionFilterFunction = (submission: any, filterValue: any) => boolean;

/**
 * Field-specific filter implementations for PMC submissions.
 */
const submissionFilterFunctions: Record<string, SubmissionFilterFunction> = {
  /**
   * Status filtering with special handling for "needs-attention" composite status
   */
  status: (submission, value) => {
    const latestVersion = submission.versions[0];
    if (!latestVersion) return false;

    switch (value) {
      case 'needs-attention':
        return NEEDS_ATTENTION_STATUSES.map((s) => s.toLowerCase()).includes(
          latestVersion.status.toLowerCase(),
        );
      default:
        return latestVersion.status.toLowerCase() === value?.toLowerCase();
    }
  },
};

/**
 * Generic filter function for PMC submissions using filter definitions.
 *
 * This function demonstrates the same filter-definition-driven approach as HHMI:
 * 1. Takes an array of filter definitions (with default support)
 * 2. Uses isFilterActive() to check which filters are currently active
 * 3. Applies field-specific filter functions for active filters
 * 4. Supports independent filters (both status filters can be active)
 *
 * @param submissions - Array of submissions to filter
 * @param activeFilters - Current active filter state from ClientFilterBar
 * @param filters - Filter definitions (defaults to PMC_FILTERS)
 * @returns Filtered array of submissions
 *
 * @example
 * ```typescript
 * // Usage in ClientFilterableList
 * filterItems={(items, searchTerm, activeFilters) => {
 *   const searchFiltered = searchTerm ? searchSubmissions(items, searchTerm) : items;
 *   return filterSubmissions(searchFiltered, activeFilters, PMC_FILTERS);
 * }}
 * ```
 */
export function filterSubmissions(
  submissions: ResolvedListing,
  activeFilters: Record<string, any>,
  filters: ui.FilterDefinition[] = PMC_FILTERS,
): ResolvedListing {
  // If "All" is explicitly selected, return all items unfiltered
  if (ui.isAllFiltersActive(activeFilters)) {
    return submissions;
  }

  return submissions.filter((submission) => {
    return filters.every((filter) => {
      // Check if this filter is currently active using the new filter utils
      if (!ui.isFilterActive(activeFilters, filter)) {
        return true; // If filter is not active, don't filter out the item
      }

      // Get the field-specific filter function
      const filterFunction = submissionFilterFunctions[filter.key];
      if (!filterFunction) {
        console.warn(`No filter function found for key: ${filter.key}`);
        return true; // Default to not filtering if no function is found
      }

      // Apply the filter function with the filter's value
      return filterFunction(submission, filter.value);
    });
  });
}

/**
 * Transforms submission items for filter bar counting by mapping error statuses to "needs-attention".
 * @param items - Array of resolved listing items
 * @returns Transformed array with status mapped for filter counting
 */
export function transformItemsForFilterBar(items: ResolvedListing): ResolvedListing {
  return items.map((submission) => {
    const latestVersion = submission.latestNonDraftVersion;
    const originalStatus = latestVersion?.status || '';
    const transformedStatus = NEEDS_ATTENTION_STATUSES.includes(originalStatus.toUpperCase())
      ? 'needs-attention'
      : originalStatus;

    return {
      ...submission,
      status: transformedStatus, // Add top-level status for ClientFilterBar
    };
  });
}
