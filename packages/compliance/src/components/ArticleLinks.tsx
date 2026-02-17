import React from 'react';
import { cn } from '@curvenote/scms-core';
import { useLoaderData } from 'react-router';
import type { NormalizedArticleRecord } from '../backend/types.js';
import { PMCLink, CurvenotePMCLink, CurvenotePreprintLink, PubMedLink } from './Badges.js';
import type { ViewContext, ViewLocation } from './Badges.js';
import { isCCBY } from '../utils/licenseFormatting.js';

export function ArticleLinks({
  item,
  size = 'xs',
  className,
  orcid,
  viewContext,
  viewLocation,
}: {
  item: NormalizedArticleRecord;
  size?:
    | 'tiny'
    | 'xs'
    | 'sm'
    | 'default'
    | 'lg'
    | 'icon'
    | 'icon-sm'
    | 'icon-xs'
    | null
    | undefined;
  className?: string;
  orcid?: string;
  viewContext: ViewContext;
  viewLocation: ViewLocation;
}) {
  // Get enhancedArticleRendering flag from loader data
  const loaderData = useLoaderData() as { enhancedArticleRendering?: boolean };
  const enhancedArticleRendering = loaderData?.enhancedArticleRendering ?? false;

  // Build array of link elements
  const linkElements: React.ReactNode[] = [];

  if (item.preprint?.pmid) {
    linkElements.push(
      <PubMedLink
        key="pubmed-preprint-link"
        pmid={item.preprint.pmid}
        publicationId={item.id}
        publicationTitle={item.preprint?.title ?? item.title ?? ''}
        size={size}
        orcid={orcid}
        viewContext={viewContext}
        viewLocation={viewLocation}
        preprint
      />,
    );
  }

  if (item.journal?.pmid) {
    linkElements.push(
      <PubMedLink
        key="pubmed-journal-link"
        pmid={item.journal.pmid}
        publicationId={item.id}
        publicationTitle={item.journal?.title ?? item.title ?? ''}
        size={size}
        orcid={orcid}
        viewContext={viewContext}
        viewLocation={viewLocation}
      />,
    );
  }

  if (item.preprint?.pmcid) {
    linkElements.push(
      <PMCLink
        key="pmc-preprint-link"
        pmcid={item.preprint.pmcid}
        publicationId={item.id}
        publicationTitle={item.preprint?.title ?? item.title ?? ''}
        size={size}
        orcid={orcid}
        viewContext={viewContext}
        viewLocation={viewLocation}
        preprint
      />,
    );
  }

  if (item.journal?.pmcid) {
    linkElements.push(
      <PMCLink
        key="pmc-journal-link"
        pmcid={item.journal.pmcid}
        publicationId={item.id}
        publicationTitle={item.preprint?.title ?? item.title ?? ''}
        size={size}
        orcid={orcid}
        viewContext={viewContext}
        viewLocation={viewLocation}
      />,
    );
  }

  if (enhancedArticleRendering && item.preprint?.pmcid && isCCBY(item.preprint?.license)) {
    linkElements.push(
      <CurvenotePMCLink
        key="curvenote-pmc-preprint-link"
        pmcid={item.preprint.pmcid}
        publicationId={item.id}
        publicationTitle={item.preprint?.title ?? item.title ?? ''}
        size={size}
        orcid={orcid}
        viewContext={viewContext}
        viewLocation={viewLocation}
        preprint
      />,
    );
  }

  if (enhancedArticleRendering && item.journal?.pmcid && isCCBY(item.journal?.license)) {
    linkElements.push(
      <CurvenotePMCLink
        key="curvenote-pmc-journal-link"
        pmcid={item.journal.pmcid}
        publicationId={item.id}
        publicationTitle={item.journal?.title ?? item.title ?? ''}
        size={size}
        orcid={orcid}
        viewContext={viewContext}
        viewLocation={viewLocation}
      />,
    );
  }

  if (enhancedArticleRendering && item.preprint?.doi && item.preprint?.doi.includes('10.1101/')) {
    linkElements.push(
      <CurvenotePreprintLink
        key="curvenote-preprint-link"
        preprintDoi={item.preprint.doi}
        publicationId={item.id}
        publicationTitle={item.title ?? ''}
        size={size}
        orcid={orcid}
        viewContext={viewContext}
        viewLocation={viewLocation}
      />,
    );
  }

  if (linkElements.length === 0) return null;

  return (
    <div className={cn('grid grid-cols-12 gap-4 dark:border-gray-800', className)}>
      <div className="flex flex-wrap col-span-12 gap-2 items-center">
        {linkElements.map((element, index) => (
          <React.Fragment key={index}>
            {element}
            {index < linkElements.length - 1 && (
              <span className="select-none text-muted-foreground">·</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
