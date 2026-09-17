import { useLoaderData } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { primitives, cn, formatDate } from '@curvenote/scms-core';
import type { PMCCombinedMetadataSection } from '../common/metadata.schema.js';
import { formatAuthors, formatManuscriptId } from './utils.js';

export interface PublicationInfoCardProps {
  /**
   * When true, show Manuscript ID / PMID / PMCID from submission metadata when present.
   * These IDs live on submission-version metadata (merged into loader `metadata.pmc`).
   */
  showPmcIdentifiers?: boolean;
  /**
   * Optional work-version id shown as "Package ID" (admin deposits only).
   * Does not control whether PMC identifiers are shown — use `showPmcIdentifiers` for that.
   */
  packageId?: string;
}

export function PublicationInfoCard({
  showPmcIdentifiers = false,
  packageId,
}: PublicationInfoCardProps) {
  const { metadata } = useLoaderData<{ metadata: PMCCombinedMetadataSection }>();

  const haveSomeMetadata =
    metadata?.pmc?.title || metadata?.pmc?.journalName || metadata?.pmc?.doiSuccess;

  if (!haveSomeMetadata) return null;

  const title = metadata?.pmc?.title;
  const journalName =
    metadata?.pmc?.journalName ??
    metadata.pmc?.doiContainerTitle ??
    metadata?.pmc?.doiShortContainerTitle;

  // ISSN information
  const issn = metadata?.pmc?.issn;
  const issnType = metadata?.pmc?.issnType;
  const doiUrl = metadata?.pmc?.doiUrl;

  const pmcMetadata = metadata?.pmc;
  const emailProcessing = pmcMetadata?.emailProcessing;
  const pmid = showPmcIdentifiers ? pmcMetadata?.pmid : undefined;
  const pmcId = showPmcIdentifiers ? pmcMetadata?.pmcid : undefined;
  const manuscriptId = showPmcIdentifiers
    ? formatManuscriptId(emailProcessing?.manuscriptId)
    : undefined;

  const showIdentifiersBlock = !!packageId || !!(manuscriptId || pmid || pmcId);

  return (
    <primitives.Card className="p-4" lift>
      <div className="space-y-2">
        <h3 className={cn('text-xl font-medium', { 'text-muted-foreground': !title })}>
          {title ?? 'Publication title (required)'}
        </h3>
        <div
          className={cn('font-medium text-md text-stone-600 dark:text-stone-400', {
            'text-muted-foreground': !journalName,
          })}
        >
          {journalName ?? 'Journal name (required)'}
          {metadata.pmc?.doiPublishedDate && (
            <span className="font-light"> ({formatDate(metadata.pmc?.doiPublishedDate)})</span>
          )}
        </div>

        {metadata.pmc?.doiAuthors && (
          <div className="text-sm font-light text-stone-600 dark:text-stone-400">
            {formatAuthors(metadata.pmc?.doiAuthors)}
          </div>
        )}
        {doiUrl && (
          <div className="text-sm font-light text-stone-500 dark:text-stone-500">
            DOI:{' '}
            <a
              href={doiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline cursor-pointer dark:text-white hover:text-blue-800 dark:hover:text-gray-300"
            >
              {doiUrl}
            </a>
          </div>
        )}
        {/* ISSN display */}
        {issn && (
          <div className="text-sm font-light text-stone-500 dark:text-stone-500">
            ISSN: {issn} {issnType && `(${issnType === 'electronic' ? 'Electronic' : 'Print'})`}
          </div>
        )}

        {showIdentifiersBlock && (
          <div className="pt-2 mt-4 border-t border-stone-300 dark:border-stone-700">
            <div className="space-y-1 text-sm text-stone-500">
              {packageId && (
                <div>
                  <span className="font-medium">Package ID:</span> {packageId}
                </div>
              )}
              {manuscriptId && (
                <div>
                  <span className="font-medium">Manuscript ID:</span> {manuscriptId}
                </div>
              )}
              {pmid && (
                <div>
                  <span className="font-medium">PMID:</span>{' '}
                  <a
                    href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-600 underline cursor-pointer dark:text-white hover:text-blue-800 dark:hover:text-gray-300"
                  >
                    <span>{pmid}</span>
                    <ExternalLink className="inline ml-[2px] w-3 h-3" />
                  </a>
                </div>
              )}
              {pmcId && (
                <div>
                  <span className="font-medium">PMC ID:</span>{' '}
                  <a
                    href={`https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcId}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-600 underline cursor-pointer dark:text-white hover:text-blue-800 dark:hover:text-gray-300"
                  >
                    <span>{pmcId}</span>
                    <ExternalLink className="inline ml-[2px] w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </primitives.Card>
  );
}
