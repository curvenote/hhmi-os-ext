import { PageFrame, MainWrapper } from '@curvenote/scms-core';
import { withAppScopedContext } from '@curvenote/scms-server';
import { fetchScientistByOrcid } from '../backend/airtable.scientists.server.js';
import { ComplianceReport } from '../components/ComplianceReport.js';
import { hhmi } from '../backend/scopes.js';
import {
  fetchEverythingCoveredByPolicy,
  fetchEverythingNotCoveredByPolicy,
} from '../backend/airtable.server.js';
import { ShareReportDialog } from '../components/ShareReportDialog.js';
import { useState } from 'react';
import type { LoaderFunctionArgs } from 'react-router';
import type { NormalizedArticleRecord, NormalizedScientist } from '../backend/types.js';
import { ComplianceInfoCards } from '../components/ComplianceInfoCards.js';

interface LoaderData {
  scientist: NormalizedScientist | undefined;
  preprintsCovered: Promise<NormalizedArticleRecord[]>;
  preprintsNotCovered: Promise<NormalizedArticleRecord[]>;
  error?: string;
  orcid: string;
}

export const meta = ({ loaderData }: { loaderData: LoaderData }) => {
  const scientist = loaderData?.scientist;
  const title = scientist ? `${scientist.fullName} - Compliance` : 'Scientist Compliance';
  return [{ title }];
};

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData | { error: string }> {
  await withAppScopedContext(args, [hhmi.compliance.admin]);

  const orcid = args.params.orcid;
  if (!orcid) {
    return { error: 'ORCID is required' };
  }
  const preprintsCoveredPromise = fetchEverythingCoveredByPolicy(orcid);
  const preprintsNotCoveredPromise = fetchEverythingNotCoveredByPolicy(orcid);
  const { scientist, error } = await fetchScientistByOrcid(orcid);

  return {
    scientist,
    preprintsCovered: preprintsCoveredPromise,
    preprintsNotCovered: preprintsNotCoveredPromise,
    error,
    orcid,
  };
}

export function shouldRevalidate(args?: { formAction?: string; [key: string]: any }) {
  // Prevent revalidation when help request form is submitted to avoid closing modals
  // Also prevent revalidation for admin sharing actions to avoid closing dialogs
  const formAction = args?.formAction;
  if (
    formAction &&
    typeof formAction === 'string' &&
    (formAction.includes('/compliance/help-request') ||
      formAction.includes('/compliance/scientists'))
  ) {
    return false;
  }
  return true;
}

export default function ScientistCompliancePage({ loaderData }: { loaderData: LoaderData }) {
  const { scientist, preprintsCovered, preprintsNotCovered, orcid } = loaderData;
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const breadcrumbs = [
    { label: 'Compliance', href: '/app/compliance' },
    { label: 'Compliance Management', href: '/app/compliance/scientists' },
    { label: `${scientist?.fullName || orcid}'s compliance dashboard`, isCurrentPage: true },
  ];

  return (
    <MainWrapper>
      <PageFrame
        title="Open Science Compliance"
        description="You are viewing this dashboard as a Compliance Manager"
        className="mx-auto max-w-screen-lg"
        breadcrumbs={breadcrumbs}
      >
        <ComplianceReport
          orcid={orcid ?? 'Unknown ORCID'}
          scientist={scientist}
          articlesCovered={preprintsCovered}
          articlesNotCovered={preprintsNotCovered}
          onShareClick={() => {
            setShareDialogOpen(true);
          }}
          viewContext="admin"
          emptyMessageCovered={`No articles covered by policy found. Only publications since the later of ${scientist?.fullName || orcid}'s HHMI hire date or January 1, 2022 are displayed.`}
          emptyMessageNotCovered="No articles found."
        />
        {scientist?.orcid && (
          <ShareReportDialog
            open={shareDialogOpen}
            onOpenChange={setShareDialogOpen}
            scientist={scientist}
            actionUrl="/app/compliance/scientists"
          />
        )}
      </PageFrame>
    </MainWrapper>
  );
}
