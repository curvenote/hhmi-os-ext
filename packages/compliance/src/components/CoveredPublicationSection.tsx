import React, { useCallback, useMemo, useState, useEffect } from 'react';
import type { NormalizedArticleRecord, NormalizedScientist } from '../backend/types.js';
import { ui } from '@curvenote/scms-core';
import {
  HHMIPublicationSearch,
  HHMIPublicationFilterBar,
  generateCoveredPublicationFilters,
  filterPublications,
  searchPublications,
} from './PublicationListingHelpers.js';
import { Files, ListTodo } from 'lucide-react';
import { filterArticlesByDate } from '../utils/dateFiltering.js';
import type { ViewContext } from './Badges.js';
import { useSearchParams } from 'react-router';

export function CoveredPublicationSection({
  publications,
  emptyMessage,
  ItemComponent,
  orcid,
  scientist,
  viewContext,
}: {
  publications?: Promise<NormalizedArticleRecord[]>;
  emptyMessage?: string;
  ItemComponent: React.ComponentType<{
    item: NormalizedArticleRecord;
    orcid: string;
    scientist: NormalizedScientist;
    viewContext: ViewContext;
  }>;
  orcid: string;
  scientist: NormalizedScientist | undefined;
  viewContext: ViewContext;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [resolvedPublications, setResolvedPublications] = useState<NormalizedArticleRecord[]>([]);

  // Resolve publications promise
  useEffect(() => {
    if (publications) {
      publications.then((data) => {
        setResolvedPublications(data);
      });
    }
  }, [publications]);

  // Apply date filtering to get the items that filters should be based on
  const dateFilteredItems = useMemo(() => {
    return filterArticlesByDate(resolvedPublications, scientist);
  }, [resolvedPublications, scientist]);

  // Generate dynamic filters from date-filtered publications data (with compliance filters)
  // This ensures filter counts match the date-filtered dataset
  const filters = useMemo(() => {
    return generateCoveredPublicationFilters(dateFilteredItems);
  }, [dateFilteredItems]);

  // Apply date filtering, search, and filters
  const applySearchAndFilters = useCallback(
    (items: NormalizedArticleRecord[], searchTerm: string, activeFilters: Record<string, any>) => {
      // First apply date filtering (pre-filter based on later of hire date or Jan 1, 2022)
      let filtered = filterArticlesByDate(items, scientist);

      // Then apply search
      filtered = searchPublications(filtered, searchTerm);

      // Finally apply user-controlled filters
      filtered = filterPublications(filtered, activeFilters, filters);

      return filtered;
    },
    [filters, scientist],
  );

  const renderPublication = (
    publication: NormalizedArticleRecord,
    globalIndex: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    localIndex?: number,
  ) => {
    if (!scientist) return null;
    return (
      <ItemComponent
        key={publication.id || `pub-${globalIndex}`}
        item={publication}
        orcid={orcid}
        scientist={scientist}
        viewContext={viewContext}
      />
    );
  };

  const renderContributionGroup = (
    groupKey: string,
    groupPublications: NormalizedArticleRecord[],
    renderItem: (
      item: NormalizedArticleRecord,
      globalIndex: number,
      localIndex: number,
    ) => React.ReactNode,
  ) => {
    const isMajorContributor = groupKey === 'true';

    return (
      <ui.GroupedItems
        groupKey={groupKey}
        groupItems={groupPublications}
        globalStartIndex={0} // This will be calculated properly by the parent component
        renderItem={renderItem}
        getItemKey={(publication: NormalizedArticleRecord, globalIndex: number) =>
          publication.id || `pub-${globalIndex}`
        }
        headerContent={(key, count) => (
          <div className="px-6 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-4 justify-between items-center">
              <div className="flex gap-3 items-center">
                {isMajorContributor ? (
                  <>
                    <div className="flex justify-center items-center w-10 h-10 rounded-full bg-stone-100">
                      <ListTodo className="w-5 h-5 text-stone-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-extralight">
                        Major Contributions ({count} items)
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        You are a major contributor; please review compliance
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-center items-center w-10 h-10 bg-gray-100 rounded-full">
                      <Files className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-extralight">Other Articles ({count} items)</h3>
                      <p className="max-w-xl text-sm text-muted-foreground">
                        You are not a major contributor on these publications. No action is needed
                        from you if compliance issues appear here. Compliance issues apply to the
                        HHMI lab head(s) making a major contribution to the article.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      />
    );
  };

  return (
    <ui.ClientFilterableList
      items={publications}
      filters={filters}
      persist={true}
      reactive={true}
      searchComponent={(searchTerm, setSearchTerm) => (
        <HHMIPublicationSearch searchTerm={searchTerm} onSearchChange={setSearchTerm} />
      )}
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      filterBar={(items, activeFilters, setActiveFilters, filterDefinitions) => {
        // Apply date filtering to items before passing to filterBar
        // so filter counts reflect date-filtered items
        // Note: filters are already generated from date-filtered items, so counts will match
        const dateFilteredForCounts = filterArticlesByDate(items, scientist);
        return (
          <HHMIPublicationFilterBar
            items={dateFilteredForCounts}
            activeFilters={activeFilters}
            setActiveFilters={setActiveFilters}
            filters={filters}
          />
        );
      }}
      filterItems={applySearchAndFilters}
      sortItems={(a, b) => {
        // Sort by date in descending order (newest first)
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      }}
      groupBy="isLinkedToPrimaryOrcid"
      sortGroups={([, aItems], [, bItems]) => {
        // Sort by actual boolean value: true (Major Contributions) before false (Other Articles)
        const aValue = aItems[0]?.isLinkedToPrimaryOrcid ?? false;
        const bValue = bItems[0]?.isLinkedToPrimaryOrcid ?? false;

        // Sort descending: true before false
        return bValue === aValue ? 0 : bValue ? 1 : -1;
      }}
      renderGroup={renderContributionGroup}
      renderItem={renderPublication}
      getItemKey={(publication: NormalizedArticleRecord) => publication.id}
      emptyMessage={emptyMessage ?? 'No publications found using your ORCID.'}
    />
  );
}
