import type { NormalizedScientist } from '../backend/types.js';
import { ui } from '@curvenote/scms-core';
import { useCompliancePingEvent } from '../utils/analytics.js';
import { HHMITrackEvent } from '../analytics/events.js';
import { useCallback } from 'react';

// HHMI-specific client search component
export interface HHMIClientSearchProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  placeholder?: string;
}

export function HHMIClientSearch({
  searchTerm,
  onSearchChange,
  placeholder = 'Search scientists by name...',
}: HHMIClientSearchProps) {
  const handleSearchChange = useCallback(
    (term: string) => {
      onSearchChange(term);
    },
    [onSearchChange],
  );

  return (
    <ui.ClientQuerySearch
      searchTerm={searchTerm}
      onSearchChange={handleSearchChange}
      placeholder={placeholder}
      resultLabel="scientist"
    />
  );
}

// HHMI-specific client filter bar component
export interface HHMIClientFilterBarProps {
  items: NormalizedScientist[] | Promise<NormalizedScientist[]>;
  activeFilters: Record<string, any>;
  setActiveFilters: (filters: Record<string, any>) => void;
  filterDefinitions?: ui.FilterDefinition[];
}

/**
 * HHMI filter definitions for compliance, ORCID, and appointment status filtering.
 *
 * Compliance filters use groupKey for mutual exclusivity (only one can be active).
 * ORCID and appointment status filters are independent and can be combined with any compliance filter.
 */
export const HHMI_FILTERS: ui.FilterDefinition[] = [
  {
    key: 'compliance',
    value: 'has-issues',
    label: 'Has Issues',
    groupKey: 'compliance-states', // Keep mutual exclusivity for compliance
  },
  {
    key: 'compliance',
    value: 'compliant',
    label: 'Compliant',
    groupKey: 'compliance-states', // Keep mutual exclusivity for compliance
  },
  { key: 'appointmentStatus', value: 'active', label: 'Active', default: true }, // Independent filter - first after "All", on by default
  { key: 'orcid', value: true, label: 'Has ORCID' }, // Independent filter
];

/**
 * Type definition for scientist-specific filter functions.
 * Each function takes a scientist object and the filter value, returning true if the scientist matches.
 */
type ScientistFilterFunction = (scientist: NormalizedScientist, filterValue: any) => boolean;

/**
 * Field-specific filter implementations for HHMI scientists.
 *
 * Each key corresponds to a filter.key in HHMI_FILTERS, and the function
 * implements the business logic for that specific field.
 */
const scientistFilterFunctions: Record<string, ScientistFilterFunction> = {
  /**
   * Compliance filtering based on non-compliant publication counts.
   * A scientist is compliant when both preprints.nonCompliant and publications.nonCompliant are 0.
   */
  compliance: (scientist, value) => {
    const totalPublications = scientist.preprints.total + scientist.publications.total;
    const isCompliant =
      scientist.preprints.nonCompliant === 0 && scientist.publications.nonCompliant === 0;

    switch (value) {
      case 'has-issues':
        return !isCompliant && totalPublications > 0;
      case 'compliant':
        return isCompliant && totalPublications > 0;
      case 'zero':
        return totalPublications === 0;
      default:
        return true;
    }
  },

  /**
   * ORCID filtering based on presence/absence of ORCID identifier
   */
  orcid: (scientist, value) => {
    if (value === true) {
      return !!(scientist.orcid && scientist.orcid.trim() !== '');
    } else {
      return !scientist.orcid || scientist.orcid.trim() === '';
    }
  },

  /**
   * Appointment status filtering based on whether the status contains a particular string.
   * Case-insensitive comparison (both strings are lowercased before matching).
   * Active means any status that does not contain the word "inactive".
   */
  appointmentStatus: (scientist, value) => {
    if (value === 'active') {
      const status = scientist.appointmentStatus?.toLowerCase() || '';
      // Active means any string that does not contain "inactive"
      return !status.includes('inactive');
    }
    return true;
  },
};

/**
 * Generic filter function for HHMI scientists using filter definitions.
 *
 * This function demonstrates the new filter-definition-driven approach:
 * 1. Takes an array of filter definitions (with groupKey/default support)
 * 2. Uses isFilterActive() to check which filters are currently active
 * 3. Applies field-specific filter functions for active filters
 * 4. Supports both independent and grouped (mutually exclusive) filters
 *
 * @param scientists - Array of scientists to filter
 * @param activeFilters - Current active filter state from ClientFilterBar
 * @param filters - Filter definitions (defaults to HHMI_FILTERS)
 * @returns Filtered array of scientists
 *
 * @example
 * ```typescript
 * // Usage in ClientFilterableList
 * filterItems={(items, searchTerm, activeFilters) => {
 *   const searchFiltered = searchTerm ? searchScientists(items, searchTerm) : items;
 *   return filterScientists(searchFiltered, activeFilters, HHMI_FILTERS);
 * }}
 * ```
 */
export function filterScientists(
  scientists: NormalizedScientist[],
  activeFilters: Record<string, any>,
  filters: ui.FilterDefinition[] = HHMI_FILTERS,
): NormalizedScientist[] {
  // If "All" is explicitly selected, return all items unfiltered
  if (ui.isAllFiltersActive(activeFilters)) {
    return scientists;
  }

  return scientists.filter((scientist) => {
    // For each filter definition, check if it should filter this scientist
    return filters.every((filter) => {
      // Check if this filter is currently active using the new filter utils
      if (!ui.isFilterActive(activeFilters, filter)) {
        return true; // If filter is not active, don't filter out the item
      }

      // Get the field-specific filter function
      const filterFunction = scientistFilterFunctions[filter.key];
      if (!filterFunction) {
        console.warn(`No filter function found for key: ${filter.key}`);
        return true; // Default to not filtering if no function is found
      }

      // Apply the filter function with the filter's value
      return filterFunction(scientist, filter.value);
    });
  });
}

export function HHMIClientFilterBar({
  items,
  activeFilters,
  setActiveFilters,
  filterDefinitions = HHMI_FILTERS,
}: HHMIClientFilterBarProps) {
  const pingEvent = useCompliancePingEvent();

  const handleFilterChange = useCallback(
    (filters: Record<string, any>) => {
      setActiveFilters(filters);
      const activeFilterCount = Object.values(filters).filter(Boolean).length;
      if (activeFilterCount > 0) {
        pingEvent(HHMITrackEvent.HHMI_COMPLIANCE_FILTER_APPLIED, {
          activeFilters: filters,
          filterCount: activeFilterCount,
        });
      }
    },
    [setActiveFilters, pingEvent],
  );

  // Custom count function for compliance and appointment status filters
  const customCountFunction = useCallback(
    (scientists: NormalizedScientist[], filter: ui.FilterDefinition) => {
      // Custom counting for compliance filters
      if (filter.key === 'compliance') {
        return scientists.filter((scientist) => {
          const totalPublications = scientist.preprints.total + scientist.publications.total;
          const isCompliant =
            scientist.preprints.nonCompliant === 0 && scientist.publications.nonCompliant === 0;

          switch (filter.value) {
            case 'has-issues':
              return !isCompliant && totalPublications > 0;
            case 'compliant':
              return isCompliant && totalPublications > 0;
            case 'zero':
              return totalPublications === 0;
            default:
              return true;
          }
        }).length;
      }

      // Custom counting for appointment status filters
      if (filter.key === 'appointmentStatus') {
        if (filter.value === 'active') {
          return scientists.filter((scientist) => {
            const status = scientist.appointmentStatus?.toLowerCase() || '';
            // Active means any string that does not contain "inactive"
            return !status.includes('inactive');
          }).length;
        }
      }

      return undefined; // Fall back to default counting for other filters
    },
    [],
  );

  return (
    <ui.ClientFilterBar
      items={items}
      filters={filterDefinitions}
      activeFilters={activeFilters}
      setActiveFilters={handleFilterChange}
      customCountFunction={customCountFunction}
    />
  );
}
