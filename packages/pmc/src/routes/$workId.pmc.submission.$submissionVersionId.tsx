import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from 'react-router';
import { redirect, Link } from 'react-router';
import type { UserWithRolesDBO } from '@curvenote/scms-server';
import { withSecureWorkContext, validateFormData } from '@curvenote/scms-server';
import type { GeneralError, Workflow, WorkflowRegistration } from '@curvenote/scms-core';
import {
  PageFrame,
  work as workScopes,
  FrameHeader,
  ui,
  primitives,
  SectionWithHeading,
  cn,
  getWorkflow,
  getBrandingFromMetaMatches,
  joinPageTitle,
} from '@curvenote/scms-core';
import { validatePMCMetadata } from '../common/validate.js';
import type { PMCWorkVersionMetadata } from '../common/validate.js';
import { PreviewMetadataSection } from '../components/PreviewMetadataSection.js';
import { FilesSection } from '../components/FilesSection.js';
import type { TramStop } from '../components/StatusTramline.js';
import { StatusTramline } from '../components/StatusTramline.js';
import { GitBranch } from 'lucide-react';
import {
  generateTramline,
  getActivitiesForSubmissionVersion,
  decorateTramlineWithEmailProcessingOutcomes,
} from '../common/tramstops/index.js';
import {
  PMC_CRITICAL_PATH_STATES,
  PMC_MUTUALLY_EXCLUSIVE_STATES,
  PMC_STATE_NAMES,
} from '../workflows.js';
import { getWorkflows } from '../client.js';
import { DepositVersionsTable } from '../components/DepositVersionsTable.js';
import { mapToDepositSubmissionDetails } from '../backend/loaderHelpers.server.js';
import { SubmissionVersionActionCard } from '../components/SubmissionVersionActionCard.js';
import { formatDistanceToNow } from 'date-fns';
import { z } from 'zod';
import { zfd } from 'zod-form-data';
import { clonePMCVersion } from '../backend/versions/clone.server.js';
import { signFilesInMetadata } from '../backend/metadata/utils.server.js';
import { dbGetSubmissionVersion, dbGetSubmissionVersions } from '../backend/db.server.js';
import { PublicationInfoCard } from '../components/PublicationInfoCard.js';
import { EmailProcessingAlert } from '../components/EmailProcessingAlert.js';
import type { WorkDTO } from '@curvenote/common';

interface LoaderData {
  user: UserWithRolesDBO;
  work: WorkDTO;
  thisSubmissionVersionId: string;
  metadata: PMCWorkVersionMetadata;
  validation: { success?: boolean } & { error?: GeneralError };
  currentWorkflow: Workflow;
  tramline: TramStop[];
  currentStatus: string;
  ended: boolean;
  submissionVersions: PMCSubmissionVersion[];
  cdnKey: string | null;
  showCreateNewVersionButton: boolean;
  showContinueThisSubmissionButton: boolean;
  showContinueLatestSubmissionButton: boolean;
}

type PMCSubmissionVersion = NonNullable<
  Awaited<ReturnType<typeof mapToDepositSubmissionDetails>>
>[number];

export const meta: MetaFunction<LoaderData> = ({ matches }) => {
  const branding = getBrandingFromMetaMatches(matches);
  return [{ title: joinPageTitle('PMC Deposit Status', branding.title) }];
};

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData | Response> {
  const ctx = await withSecureWorkContext(args, [workScopes.submissions.read]);
  // Check if PMC extension is enabled in config
  if (!ctx.$config.app.extensions?.pmc) {
    return redirect('/app/works');
  }

  // this page now loads and displays the details for a specific submission version
  const thisSubmissionVersionId = args.params.submissionVersionId;
  if (!thisSubmissionVersionId) {
    return redirect(`/app/works/${ctx.work.id}`);
  }

  const thisSubmissionVersion = await dbGetSubmissionVersion(thisSubmissionVersionId);
  if (!thisSubmissionVersion) {
    return redirect(`/app/works/${ctx.work.id}`);
  }

  const thisWorkVersionsMetadata = (thisSubmissionVersion.work_version.metadata ||
    {}) as PMCWorkVersionMetadata;

  // if this is a draft, we should re-route to deposit/ or confirm/ depending on metadata
  if (thisSubmissionVersion.status === PMC_STATE_NAMES.DRAFT) {
    const pmcMetadata = thisWorkVersionsMetadata.pmc;
    if (pmcMetadata?.previewed && !pmcMetadata?.confirmed) {
      // If previewed, redirect to confirm page
      throw redirect(`/app/works/${ctx.work.id}/site/pmc/confirm/${thisSubmissionVersionId}`);
    } else if (!pmcMetadata?.previewed && !pmcMetadata?.confirmed) {
      // If not previewed, redirect to deposit page
      throw redirect(`/app/works/${ctx.work.id}/site/pmc/deposit/${thisSubmissionVersionId}`);
    }
  }

  const thisWorkVersionCdn = thisSubmissionVersion.work_version.cdn;
  const thisWorkVersionCdnKey = thisSubmissionVersion.work_version.cdn_key;
  const validation = await validatePMCMetadata(thisWorkVersionsMetadata as PMCWorkVersionMetadata);

  // Get the submission workflow and status for the tramline using V2 generation
  const extensionWorkflows: WorkflowRegistration[] = [getWorkflows()];
  const currentWorkflow = getWorkflow(
    ctx.$config,
    extensionWorkflows,
    thisSubmissionVersion.submission.collection.workflow,
  );
  const currentStatus = thisSubmissionVersion.status;
  const activities = await getActivitiesForSubmissionVersion(thisSubmissionVersion.id);
  const { tramline: baseTramline, ended } = generateTramline(
    currentWorkflow,
    currentStatus,
    activities,
    [...PMC_CRITICAL_PATH_STATES],
    PMC_MUTUALLY_EXCLUSIVE_STATES as unknown as Record<string, string | string[]>,
    thisSubmissionVersion.date_modified,
  );

  // Decorate tramline with email processing outcomes from submission version metadata
  const submissionVersionMetadata = thisSubmissionVersion.metadata as any; // Cast to access email processing
  const tramline = decorateTramlineWithEmailProcessingOutcomes(
    baseTramline,
    submissionVersionMetadata,
  );

  const submissionVersionsRaw = await dbGetSubmissionVersions(ctx);
  // Map to include metadata, manuscript file name, and file slot counts
  const submissionVersions = await mapToDepositSubmissionDetails(submissionVersionsRaw, ctx);

  // Check if we should show the Create New Version button
  // only when the latest version has a request for a new version
  const showCreateNewVersionButton =
    thisSubmissionVersion.status === PMC_STATE_NAMES.REQUEST_NEW_VERSION &&
    submissionVersions[0].id === thisSubmissionVersion.id;

  // Check if we should show the Continue Your Submission button
  // only when this version is a draft
  const showContinueThisSubmissionButton =
    thisSubmissionVersion.status === PMC_STATE_NAMES.DRAFT &&
    submissionVersions[0].id === thisSubmissionVersion.id;

  const showContinueLatestSubmissionButton =
    submissionVersions[0].id !== thisSubmissionVersion.id &&
    submissionVersions[0].status === PMC_STATE_NAMES.DRAFT;

  const thisWorkVersionMetadataWithSignedUrls = await signFilesInMetadata(
    thisWorkVersionsMetadata,
    thisWorkVersionCdn ?? '',
    ctx,
  );

  return {
    work: ctx.workDTO,
    thisSubmissionVersionId,
    metadata: thisWorkVersionMetadataWithSignedUrls,
    cdnKey: thisWorkVersionCdnKey,
    user: ctx.user,
    validation,
    currentWorkflow,
    tramline,
    currentStatus,
    ended,
    submissionVersions,
    showCreateNewVersionButton,
    showContinueThisSubmissionButton,
    showContinueLatestSubmissionButton,
  };
}

export async function action(args: ActionFunctionArgs) {
  const ctx = await withSecureWorkContext(args, [
    workScopes.submissions.read,
    workScopes.submissions.versions.create,
  ]);

  const schema = zfd.formData({
    intent: zfd.text(z.literal('create-new-version')),
    submissionVersionId: zfd.text(),
  });
  const formData = await args.request.formData();
  const payload = validateFormData(schema, formData);
  const { intent, submissionVersionId } = payload;

  if (intent === 'create-new-version') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { newSubmissionVersionId } = await clonePMCVersion(ctx, submissionVersionId);
    // Redirect to the deposit form for the new version
    return redirect(`/app/works/${ctx.work.id}/site/pmc/deposit/${newSubmissionVersionId}`);
  }
  return null;
}

export default function PMCDepositUserFacingDetails({ loaderData }: { loaderData: LoaderData }) {
  const {
    work,
    thisSubmissionVersionId,
    metadata,
    currentWorkflow,
    tramline,
    currentStatus,
    ended,
    submissionVersions,
    cdnKey,
    showCreateNewVersionButton,
    showContinueThisSubmissionButton,
    showContinueLatestSubmissionButton,
  } = loaderData;

  function getFilesBySlot(row: PMCSubmissionVersion) {
    const files: Record<string, any> = row.workVersion.metadata?.files || {};
    const grouped: Record<string, any[]> = {};
    Object.values(files).forEach((file: any) => {
      if (file) {
        if (!grouped[file.slot]) grouped[file.slot] = [];
        grouped[file.slot].push(file);
      }
    });

    // Sort files within each slot by order field with backward compatibility
    // First, ensure consistent slot ordering by sorting slot keys
    const sortedSlots = Object.keys(grouped).sort();

    sortedSlots.forEach((slot) => {
      grouped[slot].sort((a, b) => {
        // Sort by order field if available, otherwise by uploadDate
        const orderA = a.order ?? 0;
        const orderB = b.order ?? 0;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        // Fallback to uploadDate if order is not available (backward compatibility)
        const dateA = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;

        if (dateA !== dateB) {
          return dateA - dateB;
        }

        // Final tiebreaker: sort by file name to ensure consistent ordering
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB);
      });
    });

    return grouped;
  }

  const truncatedTitle = work.title
    ? work.title.length > 32
      ? work.title.substring(0, 32) + '...'
      : work.title
    : 'Untitled Work';

  const breadcrumbs = [
    { label: 'Works', href: '/app/works' },
    { label: truncatedTitle, href: `/app/works/${work.id}` },
    { label: 'PMC Submission', isCurrentPage: true },
  ];

  const currentMessage = currentWorkflow.states[currentStatus]?.messages?.user;

  // Determine alert type based on the last completed stop in the tramline
  const lastCompletedIndex = tramline.reduce(
    (lastIdx, stop, idx) => (stop.completed ? idx : lastIdx),
    -1,
  );
  const lastCompletedStop = lastCompletedIndex >= 0 ? tramline[lastCompletedIndex] : null;

  let alertType: 'success' | 'error' | 'warning' | 'info' = 'info';
  if (lastCompletedStop) {
    if (lastCompletedStop.error) alertType = 'error';
    else if (lastCompletedStop.warning) alertType = 'warning';
    else if (ended) alertType = 'success';
  }

  const latestSubmissionVersion = submissionVersions[0];
  const currentSubmissionVersion = submissionVersions.find(
    (sv) => sv.id === thisSubmissionVersionId,
  );
  const doNotShowDetails = showContinueThisSubmissionButton;

  return (
    <PageFrame
      header={
        <FrameHeader
          title="PMC Submission Status"
          description="HHMI is depositing your article on PubMed Central to ensure it stays open access."
        />
      }
      className="max-w-4xl"
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-12">
        {/* we are not actually expecting to hit this page, but its a fallback in case */}
        {showContinueThisSubmissionButton && (
          <ui.SimpleAlert
            type="warning"
            message={
              <div className="space-y-4">
                <div>
                  You already started a new version of this deposit{' '}
                  <span className="font-semibold">
                    {formatDistanceToNow(new Date(latestSubmissionVersion.date_created), {
                      addSuffix: true,
                    })}
                  </span>
                  , please complete it.
                </div>
                <ui.Button asChild>
                  <Link
                    className="no-underline"
                    to={`/app/works/${work.id}/site/pmc/deposit/${thisSubmissionVersionId}`}
                  >
                    Continue Deposit
                  </Link>
                </ui.Button>
              </div>
            }
          />
        )}
        {!doNotShowDetails && (
          <>
            <div className="space-y-4">
              {/* Create New Version Button */}
              {showCreateNewVersionButton && (
                <SubmissionVersionActionCard
                  intent="create-new-version"
                  title="Create New Version"
                  message={
                    <div>
                      <div>
                        A new version of your PMC deposit has been requested, please review the
                        warning and/or error messages below for more information.
                      </div>
                      <div>
                        Clicking on the button below will create a new version of your submission
                        that you can edit and add to as needed.
                      </div>
                    </div>
                  }
                  buttonText="Create New Version"
                  submissionVersionId={latestSubmissionVersion?.id || ''}
                />
              )}
              {showContinueLatestSubmissionButton && (
                <>
                  <ui.SimpleAlert
                    type="warning"
                    message={
                      <div className="space-y-4">
                        <div>
                          You already started a new version of this deposit{' '}
                          <span className="font-semibold">
                            {formatDistanceToNow(new Date(latestSubmissionVersion.date_created), {
                              addSuffix: true,
                            })}
                          </span>
                          , please complete it.
                        </div>
                        <ui.Button asChild>
                          <Link
                            className="no-underline"
                            to={`/app/works/${work.id}/site/pmc/deposit/${latestSubmissionVersion.id}`}
                          >
                            Continue Latest Deposit
                          </Link>
                        </ui.Button>
                      </div>
                    }
                  />
                </>
              )}
              <StatusTramline stops={tramline} ended={ended} lookahead={!ended} />
              {currentMessage && (
                <ui.SimpleAlert type={alertType} size="compact" message={currentMessage} />
              )}
              {currentSubmissionVersion && (
                <EmailProcessingAlert
                  metadata={currentSubmissionVersion.metadata}
                  workflow={currentWorkflow}
                />
              )}
            </div>
            <div className="space-y-6">
              <h2>Publication Information</h2>
              <PublicationInfoCard />
            </div>

            <PreviewMetadataSection pmc={metadata.pmc} />
            {cdnKey && <FilesSection cdnKey={cdnKey} readonly hideEmpty hideAlerts />}
            {!cdnKey && (
              <ui.SimpleAlert
                type="error"
                message="Cannot display the uploaded files for this deposit, please contact support (No CDN key found for work version)."
              />
            )}
          </>
        )}

        <SectionWithHeading heading="Versions" icon={GitBranch}>
          <primitives.Card lift>
            <DepositVersionsTable
              viewingSubmissionVersionId={thisSubmissionVersionId}
              submissionVersions={submissionVersions}
              workflow={currentWorkflow}
              basePath="/app/works"
              renderDetails={(row: PMCSubmissionVersion) => {
                const filesBySlot = getFilesBySlot(row);
                const sortedSlotEntries = Object.entries(filesBySlot).sort(([a], [b]) =>
                  a.localeCompare(b),
                );
                return (
                  <div className="text-base text-gray-800">
                    <div className="flex flex-wrap gap-y-1 gap-x-2 items-center text-sm text-gray-600">
                      {sortedSlotEntries.length === 0 ? (
                        <span className="mr-0">no files</span>
                      ) : (
                        <ui.Popover>
                          <ui.PopoverTrigger asChild>
                            <span
                              className={cn(
                                'text-blue-600 underline cursor-pointer hover:text-blue-800',
                                'transition-colors',
                              )}
                              tabIndex={0}
                              aria-label="Show all files"
                            >
                              {sortedSlotEntries
                                .map(([slot, files]) => {
                                  const slotLabel = slot.replace('pmc/', '');
                                  const count = files.length;
                                  return `${count} ${slotLabel}`;
                                })
                                .join(', ')}
                            </span>
                          </ui.PopoverTrigger>
                          <ui.PopoverContent
                            align="start"
                            sideOffset={8}
                            className="p-4 min-w-80 max-w-96"
                          >
                            <ui.PopoverArrow className="fill-white dark:fill-stone-900" />
                            <div className="space-y-4">
                              {sortedSlotEntries.map(([slot, files]) => {
                                const slotLabel = slot.replace('pmc/', '');
                                return (
                                  <div key={slot}>
                                    <div className="mb-2 text-sm font-medium">{slotLabel}</div>
                                    <ul className="pl-2 space-y-1">
                                      {files.map((file: any) => (
                                        <li key={file.name}>
                                          {file.signedUrl ? (
                                            <a
                                              href={file.signedUrl}
                                              download
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-sm text-blue-700 underline hover:text-blue-900"
                                            >
                                              {file.name}
                                            </a>
                                          ) : (
                                            <span className="text-sm text-gray-400 cursor-not-allowed">
                                              {file.name}
                                            </span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                          </ui.PopoverContent>
                        </ui.Popover>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          </primitives.Card>
        </SectionWithHeading>
      </div>
    </PageFrame>
  );
}
