import { useLoaderData } from 'react-router';
import type { NormalizedArticleRecord } from '../backend/types.js';
import {
  JournalLinkBadge,
  PreprintLinkBadge,
  PubMedLinkBadge,
  PMCLinkBadge,
  CurvenotePMCLinkBadge,
  CurvenotePreprintLinkBadge,
  type ViewContext,
  type ViewLocation,
} from './Badges.js';
import { isCCBY } from '../utils/licenseFormatting.js';

export function PublicationLinks({
  publication: pub,
  orcid,
  viewContext,
  viewLocation,
}: {
  publication?: NormalizedArticleRecord;
  orcid?: string;
  viewContext: ViewContext;
  viewLocation: ViewLocation;
}) {
  // Get enhancedArticleRendering flag from loader data
  const loaderData = useLoaderData() as { enhancedArticleRendering?: boolean };
  const enhancedArticleRendering = loaderData?.enhancedArticleRendering ?? false;

  if (!pub) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2 text-sm text-gray-600 dark:text-gray-400">
      {pub.journal?.doi && (
        <JournalLinkBadge
          doi={pub.journal.doi}
          publicationId={pub.id}
          publicationTitle={pub.journal.title ?? ''}
          orcid={orcid}
          viewContext={viewContext}
          viewLocation={viewLocation}
        />
      )}
      {pub.preprint?.doi && (
        <PreprintLinkBadge
          preprintDoi={pub.preprint.doi}
          publicationId={pub.id}
          publicationTitle={pub.title ?? ''}
          orcid={orcid}
          viewContext={viewContext}
          viewLocation={viewLocation}
        />
      )}
      {pub.preprint?.pmid && (
        <PubMedLinkBadge
          pmid={pub.preprint.pmid}
          publicationTitle={pub.preprint.title ?? ''}
          publicationId={pub.id}
          orcid={orcid}
          viewContext={viewContext}
          viewLocation={viewLocation}
          preprint
        />
      )}
      {pub.journal?.pmid && (
        <PubMedLinkBadge
          pmid={pub.journal.pmid}
          publicationTitle={pub.title ?? ''}
          publicationId={pub.id}
          orcid={orcid}
          viewContext={viewContext}
          viewLocation={viewLocation}
        />
      )}
      {pub.preprint?.pmcid && (
        <PMCLinkBadge
          pmcid={pub.preprint.pmcid}
          publicationTitle={pub.preprint.title ?? ''}
          publicationId={pub.id}
          orcid={orcid}
          viewContext={viewContext}
          viewLocation={viewLocation}
          preprint
        />
      )}
      {pub.journal?.pmcid && (
        <PMCLinkBadge
          pmcid={pub.journal.pmcid}
          publicationTitle={pub.journal.title ?? ''}
          publicationId={pub.id}
          orcid={orcid}
          viewContext={viewContext}
          viewLocation={viewLocation}
        />
      )}
      {enhancedArticleRendering && pub.preprint?.pmcid && isCCBY(pub.preprint?.license) && (
        <CurvenotePMCLinkBadge
          pmcid={pub.preprint.pmcid}
          publicationId={pub.id}
          publicationTitle={pub.preprint.title ?? ''}
          orcid={orcid}
          viewContext={viewContext}
          viewLocation={viewLocation}
          preprint
        />
      )}
      {enhancedArticleRendering && pub.journal?.pmcid && isCCBY(pub.journal?.license) && (
        <CurvenotePMCLinkBadge
          pmcid={pub.journal.pmcid}
          publicationId={pub.id}
          publicationTitle={pub.title ?? ''}
          orcid={orcid}
          viewContext={viewContext}
          viewLocation={viewLocation}
        />
      )}
      {enhancedArticleRendering && pub.preprint?.doi && pub.preprint.doi.includes('10.1101/') && (
        <CurvenotePreprintLinkBadge
          preprintDoi={pub.preprint.doi}
          publicationId={pub.id}
          publicationTitle={pub.title ?? ''}
          orcid={orcid}
          viewContext={viewContext}
          viewLocation={viewLocation}
        />
      )}
    </div>
  );
}
