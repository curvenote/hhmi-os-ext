import type { Workflow } from '@curvenote/scms-core';
import { ui } from '@curvenote/scms-core';
import {
  PMCClientSearch,
  filterSubmissions,
  transformItemsForFilterBar,
  PMC_FILTERS,
} from '../../components/ClientListingHelpers.js';
import { SubmissionCard } from './SubmissionCard.js';
import { formatManuscriptId } from '../../components/utils.js';

import type { ListingPromise, ResolvedListing } from './types.js';

export function SubmissionList({
  submissions,
  workflows,
  siteName,
}: {
  submissions: ListingPromise;
  workflows: Workflow[];
  siteName: string;
}) {
  const renderStatusGroup = (
    status: string,
    statusItems: ResolvedListing,
    renderItem: (
      item: ResolvedListing[number],
      globalIndex: number,
      localIndex: number,
    ) => React.ReactNode,
  ) => {
    // Find the workflow and get the status label
    const firstSubmission = statusItems[0];
    const workflowName = firstSubmission?.collection?.workflow;
    const workflow = workflowName ? workflows.find((w) => w.name === workflowName) : undefined;
    const statusLabel = workflow?.states?.[status]?.label ?? status;

    return (
      <ui.GroupedItems
        groupKey={status}
        groupItems={statusItems}
        globalStartIndex={0} // This will be calculated properly by the parent component
        renderItem={renderItem}
        getItemKey={(submission: ResolvedListing[number], globalIndex: number) =>
          submission.id || `pub-${globalIndex}`
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        headerContent={(_groupKey, _count, _items) => (
          <div className="px-6 pt-6 pb-3 border-b-2 border-gray-300 shadow-xs dark:border-gray-600">
            <h3 className="text-xl text-gray-900 font-extralight dark:text-gray-100">
              {statusLabel}
            </h3>
          </div>
        )}
      />
    );
  };

  const renderItem = (submission: ResolvedListing[number]) => (
    <SubmissionCard submission={submission} workflows={workflows} siteName={siteName} />
  );

  // Use the standardized PMC filters (both already have default: true)

  return (
    <ui.ClientFilterableList
      persist
      items={submissions}
      filters={PMC_FILTERS}
      className="max-w-none"
      searchComponent={(searchTerm, setSearchTerm) => (
        <PMCClientSearch searchTerm={searchTerm} onSearchChange={setSearchTerm} />
      )}
      filterBar={(items, activeFilters, setActiveFilters, filterDefinitions) => (
        <ui.ClientFilterBar
          items={transformItemsForFilterBar(items)}
          filters={filterDefinitions}
          activeFilters={activeFilters}
          setActiveFilters={setActiveFilters}
        />
      )}
      groupBy={(submission) => submission.latestNonDraftVersion.status}
      filterItems={(items, searchTerm, activeFilters) => {
        // Apply search filtering with comprehensive PMC field coverage
        const searchFiltered = searchTerm.trim()
          ? items.filter((submission) => {
              const searchLower = searchTerm.toLowerCase();
              const latestVersion = submission.latestNonDraftVersion;
              if (!latestVersion) return false;

              // Extract metadata from both submission version and work version
              const svMetadata = (latestVersion.metadata ?? {}) as any;
              const wvMetadata = latestVersion.work_version?.metadata as any;

              // PMC-specific fields to search
              const title = wvMetadata?.pmc?.title ?? '';
              const journalName = wvMetadata?.pmc?.journalName ?? '';
              const issn = wvMetadata?.pmc?.issn ?? '';
              // Get manuscript ID from email processing record (single record structure)
              const emailProcessing = svMetadata.pmc?.emailProcessing;
              // Matched in its displayed `NIHMS…` form so searching what the card
              // shows works, as well as the bare stored number.
              const manuscriptId = formatManuscriptId(emailProcessing?.manuscriptId) ?? '';
              const pmid = svMetadata.pmc?.pmid ?? '';
              const pmcid = svMetadata.pmc?.pmcid ?? '';
              const submittedBy = submission.submitted_by.display_name ?? '';

              // Search across all relevant PMC fields
              return (
                title.toLowerCase().includes(searchLower) ||
                journalName.toLowerCase().includes(searchLower) ||
                issn.toLowerCase().includes(searchLower) ||
                manuscriptId.toLowerCase().includes(searchLower) ||
                submittedBy.toLowerCase().includes(searchLower) ||
                pmid.toLowerCase().includes(searchLower) ||
                pmcid.toLowerCase().includes(searchLower)
              );
            })
          : items;

        // Apply filter definitions using the generic helper
        return filterSubmissions(searchFiltered, activeFilters, PMC_FILTERS);
      }}
      renderGroup={renderStatusGroup}
      renderItem={renderItem}
      getItemKey={(submission) => submission.id}
      emptyMessage="No submissions found."
    />
  );
}
