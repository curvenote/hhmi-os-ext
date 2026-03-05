import { formatDistance } from 'date-fns';
import { Link, useLocation } from 'react-router';
import { ExternalLink } from 'lucide-react';
import type { Workflow, GeneralError } from '@curvenote/scms-core';
import { ui } from '@curvenote/scms-core';
import { ActionsAreaForm } from '../../components/ActionsArea.js';
import { getAvailableTransitionsForAdmin } from '../../workflows.js';
import type { ResolvedListing } from './types.js';
import type { PMCWorkVersionMetadataSection } from '../../common/metadata.schema.js';

interface SubmissionCardProps {
  submission: ResolvedListing[number];
  workflows: Workflow[];
  siteName: string;
}

export function SubmissionCard({ submission, workflows, siteName }: SubmissionCardProps) {
  const latestVersion = submission.latestNonDraftVersion;
  if (!latestVersion) return null;

  const workVersion = latestVersion.work_version;

  const title = workVersion?.title || '—';
  const status = latestVersion.status || '—';

  // Look up the workflow and status label
  const workflowName = submission.collection?.workflow;
  const workflow = workflowName ? workflows.find((w) => w.name === workflowName) : undefined;
  const transitions = getAvailableTransitionsForAdmin(workflow, status);

  const handleError = (errorValue: GeneralError | string | undefined) => {
    if (errorValue) {
      let errorMessage: string;
      if (typeof errorValue === 'string') {
        errorMessage = errorValue;
      } else if (errorValue && typeof errorValue === 'object' && 'message' in errorValue) {
        errorMessage = errorValue.message;
      } else {
        errorMessage = 'An unknown error occurred';
      }
      ui.toastError(errorMessage);
    }
  };

  // Get submission version metadata for DOI, PMID, PMCID, and journal name
  const submissionVersionMetadata = latestVersion.metadata as any;
  const workVersionMetadata = workVersion?.metadata as PMCWorkVersionMetadataSection;
  const pmcMetadata = submissionVersionMetadata?.pmc;
  const emailProcessing = pmcMetadata?.emailProcessing;
  const doi = workVersionMetadata?.pmc?.doiUrl;

  // Get manuscript ID from email processing record (single record structure)
  const manuscriptId = emailProcessing?.manuscriptId;

  // Get the email processing status (single record structure)
  const emailProcessingStatus = emailProcessing?.status;

  const pmid = pmcMetadata?.pmid;
  const pmcid = pmcMetadata?.pmcid;
  const journalName = workVersionMetadata?.pmc?.journalName;

  const location = useLocation();

  // Create details URL with return path to preserve current inbox state
  const currentInboxUrl = `${location.pathname}${location.search}`;
  const returnToParam = encodeURIComponent(currentInboxUrl);
  const detailsUrl = `/app/sites/${siteName}/deposits/${submission.id}/v/${latestVersion.id}?returnTo=${returnToParam}`;

  return (
    <div className="flex flex-col items-start border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <div
        data-name="submission-card-container"
        className="flex flex-col items-start w-full gap-1 px-6 py-4 md:gap-6 md:flex-row"
      >
        {/* Column 1: Title, Submitter, and Links */}
        <div className="flex-grow">
          <div className="flex items-start gap-2">
            <h3 className="font-normal leading-tight transition-colors line-clamp-2">
              <Link
                to={detailsUrl}
                className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                {title}
              </Link>
            </h3>
          </div>

          <div className="flex flex-wrap gap-1 mt-2 text-sm text-gray-600 dark:text-gray-400">
            {/* Journal Name */}
            {journalName && (
              <>
                <span>Journal: {journalName}</span>
                <span>•</span>
              </>
            )}
            {/* Submitter */}
            <span>Submitted by: {submission.submitted_by.display_name || '—'}</span>
          </div>

          {/* DOI, Manuscript ID, PMID, PMCID Links */}
          <div className="flex flex-wrap gap-2 mt-3 text-sm text-gray-600 dark:text-gray-400">
            {doi && (
              <ui.Badge variant="outline" asChild>
                <a
                  href={doi}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  DOI: {doi.replace('https://doi.org/', '').split('/').slice(-2).join('/')}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </ui.Badge>
            )}
            {manuscriptId && <ui.Badge variant="outline">NIHMSID: {manuscriptId}</ui.Badge>}
            {pmid && (
              <ui.Badge variant="outline" asChild>
                <a
                  href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  PMID: {pmid}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </ui.Badge>
            )}
            {pmcid && (
              <ui.Badge variant="outline" asChild>
                <a
                  href={`https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmcid}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  PMCID: {pmcid}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </ui.Badge>
            )}
          </div>
        </div>

        {/* Column 2: Status and Transitions */}
        <div className="flex flex-col flex-shrink-0 items-center self-stretch w-42 pt-[1px]">
          <div className="flex flex-wrap justify-center w-full gap-2 mb-2">
            {workflow && (
              <ui.SubmissionVersionBadge
                submissionVersion={{
                  ...latestVersion,
                  submission: submission,
                }}
                workflows={{ [workflowName]: workflow }}
                basePath={`/app/sites/${siteName}/deposits/${submission.id}`}
                workVersionId={latestVersion.id}
              />
            )}
            {submission.hasDraft && (
              <ui.Badge
                variant="outline"
                className="text-black dark:text-white"
                title="The submitter has started a new deposit, but has not yet submitted this version for review."
              >
                has draft
              </ui.Badge>
            )}
            {emailProcessingStatus && (
              <ui.Badge
                variant={emailProcessingStatus === 'error' ? 'destructive' : 'outline'}
                className="text-black dark:text-white"
              >
                {emailProcessingStatus}
              </ui.Badge>
            )}
          </div>

          {/* Date */}
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {latestVersion?.date_created
              ? formatDistance(new Date(latestVersion.date_created), new Date(), {
                  addSuffix: true,
                }).replace('about ', '~')
              : '—'}
          </div>
        </div>

        {/* Column 3: Actions */}
        <div className="flex flex-col items-center self-stretch flex-shrink-0 w-42">
          {/* Actions Area (if transitions exist) */}
          {transitions.length > 0 && (
            <div className="mb-2">
              <ActionsAreaForm
                transitions={transitions}
                submissionVersion={latestVersion}
                onError={handleError}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
