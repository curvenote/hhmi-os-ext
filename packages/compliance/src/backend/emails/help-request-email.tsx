import { Heading, Text, Section, Button } from '@react-email/components';
import React from 'react';
import type { NormalizedArticleRecord } from '../types.js';
import { getComplianceListStatus } from '../../utils/complianceStatus.js';

/**
 * Formats publication information in a structured table-like format for email
 */
function formatPublicationInfo(publication: NormalizedArticleRecord): React.ReactNode {
  const sections: React.ReactNode[] = [];

  // Title
  sections.push(
    <Text key="title" className="text-[14px] text-black leading-[24px] my-0">
      <strong>Title:</strong> {publication.title || 'Publication title not available'}
    </Text>,
  );

  // Compliance Status (aligned with list badge / modal)
  const complianceStatus = getComplianceListStatus(publication);
  sections.push(
    <Text key="compliance" className="text-[14px] text-black leading-[24px] my-0">
      <strong>Compliance Status:</strong> {complianceStatus.label}
    </Text>,
  );

  // Publication Identifiers
  const identifiers: string[] = [];
  if (publication.preprint) {
    const { pmid, pmcid, doi } = publication.preprint;
    if (pmid) identifiers.push(`PubMed ID: ${pmid}`);
    if (pmcid) identifiers.push(`PubMed Central ID: ${pmcid}`);
    if (doi) identifiers.push(`Preprint DOI: ${doi}`);
  }
  if (publication.journal) {
    const { pmid, pmcid, doi } = publication.journal;
    if (pmid) identifiers.push(`PubMed ID: ${pmid}`);
    if (pmcid) identifiers.push(`PubMed Central ID: ${pmcid}`);
    if (doi) identifiers.push(`Journal DOI: ${doi}`);
  }

  if (identifiers.length > 0) {
    sections.push(
      <Text key="identifiers" className="text-[14px] text-black leading-[24px] my-0">
        <strong>Publication Identifiers:</strong>
      </Text>,
    );
    identifiers.forEach((id, index) => {
      sections.push(
        <Text key={`id-${index}`} className="text-[14px] text-black leading-[24px] my-0 ml-4">
          • {id}
        </Text>,
      );
    });
  }

  // Preprint Issue Type and Status
  if (publication.preprint?.complianceIssueType || publication.preprint?.complianceIssueStatus) {
    sections.push(
      <Text key="preprint-header" className="text-[14px] text-black leading-[24px] my-0 mt-2">
        <strong>Preprint:</strong>
      </Text>,
    );
    if (publication.preprint.complianceIssueType) {
      sections.push(
        <Text key="preprint-type" className="text-[14px] text-black leading-[24px] my-0 ml-4">
          • Issue Type: {publication.preprint.complianceIssueType}
        </Text>,
      );
    }
    if (publication.preprint.complianceIssueStatus) {
      sections.push(
        <Text key="preprint-status" className="text-[14px] text-black leading-[24px] my-0 ml-4">
          • Issue Status: {publication.preprint.complianceIssueStatus}
        </Text>,
      );
    }
  }

  // Journal Issue Type and Status
  if (publication.journal?.complianceIssueType || publication.journal?.complianceIssueStatus) {
    sections.push(
      <Text key="journal-header" className="text-[14px] text-black leading-[24px] my-0 mt-2">
        <strong>Journal:</strong>
      </Text>,
    );
    if (publication.journal.complianceIssueType) {
      sections.push(
        <Text key="journal-type" className="text-[14px] text-black leading-[24px] my-0 ml-4">
          • Issue Type: {publication.journal.complianceIssueType}
        </Text>,
      );
    }
    if (publication.journal.complianceIssueStatus) {
      sections.push(
        <Text key="journal-status" className="text-[14px] text-black leading-[24px] my-0 ml-4">
          • Issue Status: {publication.journal.complianceIssueStatus}
        </Text>,
      );
    }
  }

  return <>{sections}</>;
}

/**
 * Composes the email body content for a compliance help request
 */
export function HelpRequestEmail(params: {
  userName: string;
  userEmail: string;
  message: string;
  publication?: NormalizedArticleRecord;
  orcid: string;
  asBaseUrl?: (path: string) => string;
}): React.ReactNode {
  const { userName, userEmail, message, publication, orcid, asBaseUrl } = params;

  // Build the dashboard URL with search parameter if publication exists
  // Use encodeURIComponent to match what ClientFilterableList expects
  const publicationTitle = publication?.title || '';
  const encodedSearch = publicationTitle.trim() ? encodeURIComponent(publicationTitle.trim()) : '';
  const dashboardPath = `/app/compliance/scientists/${orcid}${encodedSearch ? `?search=${encodedSearch}` : ''}`;
  const dashboardUrl = asBaseUrl ? asBaseUrl(dashboardPath) : dashboardPath;

  return (
    <>
      <Heading className="mx-0 my-[30px] p-0 text-[24px] font-normal text-black">
        Help Requested from a Compliance Dashboard
      </Heading>
      <Text className="text-[14px] text-black leading-[24px]">
        {publication
          ? 'A user has requested help regarding a publication in the Compliance Dashboard:'
          : 'A user has requested help regarding the Compliance Dashboard:'}
      </Text>
      <Section className="my-[16px] p-[16px] bg-[#f4f4f4] rounded">
        <Text className="text-[14px] text-black leading-[24px] my-0">
          <strong>Name:</strong> {userName}
        </Text>
        <Text className="text-[14px] text-black leading-[24px] my-0">
          <strong>Email:</strong> {userEmail}
        </Text>
      </Section>
      <Text className="text-[14px] text-black leading-[24px]">
        <strong>User's Message:</strong>
      </Text>
      <Section className="my-[16px] p-[16px] bg-[#f4f4f4] rounded">
        <Text className="text-[14px] text-black leading-[24px] whitespace-pre-wrap my-0">
          {message}
        </Text>
      </Section>
      {publication && (
        <>
          <Text className="text-[14px] text-black leading-[24px]">
            <strong>Publication Information:</strong>
          </Text>
          <Section className="my-[16px] p-[16px] bg-[#f4f4f4] rounded">
            {formatPublicationInfo(publication)}
          </Section>
        </>
      )}
      <Text className="text-[14px] text-black leading-[24px]">
        {publication
          ? 'Click the button below to view this publication in the Compliance Dashboard:'
          : 'Click the button below to view the Compliance Dashboard:'}
      </Text>
      <Section className="mt-[32px] mb-[32px] text-center">
        <Button
          className="rounded bg-[#000000] px-5 py-3 text-center font-semibold text-[12px] text-white no-underline"
          href={dashboardUrl}
        >
          {publication ? 'View Publication in Dashboard' : 'View Compliance Dashboard'}
        </Button>
      </Section>
    </>
  );
}
