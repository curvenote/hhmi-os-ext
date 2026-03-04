import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { redirect, useNavigate, useSearchParams } from 'react-router';
import { validatePMCMetadata } from '../common/validate.js';
import type { PMCCombinedMetadataSection } from '../common/metadata.schema.js';
import { GitBranch } from 'lucide-react';
import { PreviewMetadataSection } from '../components/PreviewMetadataSection.js';
import { FilesSection } from '../components/FilesSection.js';
import type { TramStop } from '../components/StatusTramline.js';
import { StatusTramline } from '../components/StatusTramline.js';
import { DepositVersionsTable } from '../components/DepositVersionsTable.js';
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
import { withAppPMCContext } from '../backend/context.server.js';
import type { DepositSubmissionDetails } from '../backend/loaderHelpers.server.js';
import { mapToDepositSubmissionDetails } from '../backend/loaderHelpers.server.js';
import type {
  GeneralError,
  Workflow,
  WorkflowTransition,
  WorkflowRegistration,
} from '@curvenote/scms-core';
import {
  getBrandingFromMetaMatches,
  getWorkflow,
  joinPageTitle,
  site,
  ui,
  primitives,
  PageFrame,
  FrameHeader,
  SectionWithHeading,
  cn,
} from '@curvenote/scms-core';
import { EmailProcessingAlert } from '../components/EmailProcessingAlert.js';
import { PublicationInfoCard } from '../components/PublicationInfoCard.js';
import { ActionsAreaForm } from '../components/ActionsArea.js';
import { useState } from 'react';
import type { UserWithRolesDBO } from '@curvenote/scms-server';
import { getPrismaClient } from '@curvenote/scms-server';

interface LoaderData {
  thisSubmissionVersionId: string;
  metadata: PMCCombinedMetadataSection;
  cdnKey: string | null;
  user: UserWithRolesDBO;
  validation: { success?: boolean } & { error?: GeneralError };
  currentWorkflow: Workflow;
  tramline: TramStop[];
  currentStatus: string;
  ended: boolean;
  submissionVersions: DepositSubmissionDetails[];
  transitions: WorkflowTransition[];
}

export const meta: MetaFunction<LoaderData> = ({ matches }) => {
  const branding = getBrandingFromMetaMatches(matches);
  return [{ title: joinPageTitle('PMC Deposit Details', branding.title) }];
};

export const loader = async (args: LoaderFunctionArgs): Promise<LoaderData> => {
  const ctx = await withAppPMCContext(args, [site.submissions.read]);

  // Check if PMC extension is enabled in config
  if (!ctx.$config.app.extensions?.pmc) {
    throw redirect('/app/works');
  }

  const thisSubmissionVersionId = args.params.submissionVersionId!;

  const prisma = await getPrismaClient();
  // Get all submission versions for this work and PMC site
  const submissionVersionsRaw = await prisma.submissionVersion.findMany({
    where: {
      submission: {
        id: args.params.submissionId,
        site: {
          name: 'pmc',
        },
      },
    },
    include: {
      work_version: true,
      submission: {
        include: {
          collection: true,
          site: true,
        },
      },
    },
    orderBy: { date_created: 'desc' },
  });

  // Map to include metadata, manuscript file name, and file slot counts
  const submissionVersionsWithCombinedMetadata = await mapToDepositSubmissionDetails(
    submissionVersionsRaw,
    ctx,
  );

  // Find the specific submission version we're viewing (not always the latest)
  const thisSubmissionVersion = submissionVersionsWithCombinedMetadata.find(
    (sv) => sv.id === thisSubmissionVersionId,
  );

  if (!thisSubmissionVersion) {
    throw redirect('/app/sites/pmc/inbox');
  }

  // Admin should never see draft versions: redirect to latest non-draft or inbox
  if (thisSubmissionVersion.status === PMC_STATE_NAMES.DRAFT) {
    const latestNonDraft = submissionVersionsWithCombinedMetadata.find(
      (sv) => sv.status !== PMC_STATE_NAMES.DRAFT,
    );
    if (latestNonDraft) {
      throw redirect(`/app/sites/pmc/deposits/${args.params.submissionId}/v/${latestNonDraft.id}`);
    }
    throw redirect('/app/sites/pmc/inbox');
  }

  // Use the specific submission version's metadata for the main display
  const thisSubmissionVersionMetadata: PMCCombinedMetadataSection =
    thisSubmissionVersion?.metadata ?? {};
  const thisWorkVersionCdnKey = thisSubmissionVersion?.workVersion.cdn_key;
  const validation = await validatePMCMetadata(thisSubmissionVersionMetadata);

  // Get the submission workflow and status for the tramline using activity-based generation
  const extensionWorkflows: WorkflowRegistration[] = [getWorkflows()];
  const currentWorkflow = getWorkflow(
    ctx.$config,
    extensionWorkflows,
    thisSubmissionVersion.submission.collection.workflow,
  );
  const currentStatus = thisSubmissionVersion.status;
  const activities = await getActivitiesForSubmissionVersion(thisSubmissionVersionId);
  const { tramline: baseTramline, ended } = generateTramline(
    currentWorkflow,
    currentStatus,
    activities,
    [...PMC_CRITICAL_PATH_STATES],
    PMC_MUTUALLY_EXCLUSIVE_STATES as unknown as Record<string, string | string[]>,
    thisSubmissionVersion.date_modified,
  );

  // Decorate tramline with email processing outcomes
  const tramline = decorateTramlineWithEmailProcessingOutcomes(
    baseTramline,
    thisSubmissionVersionMetadata,
  );

  // Calculate available transitions for action buttons: state-specific plus "from any state"
  // (sourceStateName === null). Exclude when target is current state; exclude null-source when in DRAFT.
  const allCandidates =
    currentWorkflow?.transitions?.filter((t: WorkflowTransition) => {
      if (!t.userTriggered || t.targetStateName === currentStatus) return false;
      const fromCurrent = t.sourceStateName === currentStatus;
      const fromAny = t.sourceStateName === null;
      if (fromAny && currentStatus === PMC_STATE_NAMES.DRAFT) return false;
      return fromCurrent || fromAny;
    }) ?? [];
  // Deduplicate by targetStateName: prefer state-specific over null-source
  const byTarget = new Map<string, WorkflowTransition>();
  for (const t of allCandidates) {
    const existing = byTarget.get(t.targetStateName);
    if (!existing || (t.sourceStateName === currentStatus && existing.sourceStateName === null)) {
      byTarget.set(t.targetStateName, t);
    }
  }
  // Don't show transitions whose target state is authorOnly (e.g. Cancel → CANCELLED)
  const transitions = Array.from(byTarget.values()).filter(
    (t) => !currentWorkflow?.states?.[t.targetStateName]?.authorOnly,
  );

  return {
    thisSubmissionVersionId: thisSubmissionVersionId,
    metadata: thisSubmissionVersionMetadata,
    cdnKey: thisWorkVersionCdnKey,
    user: ctx.user,
    validation,
    currentWorkflow,
    tramline,
    currentStatus,
    ended,
    submissionVersions: submissionVersionsWithCombinedMetadata,
    transitions,
  };
};

export default function PMCDetailsPage({ loaderData }: { loaderData: LoaderData }) {
  const {
    metadata,
    thisSubmissionVersionId,
    currentWorkflow,
    currentStatus,
    tramline,
    ended,
    submissionVersions,
    cdnKey,
    transitions,
  } = loaderData;
  const [error, setError] = useState<GeneralError | string | undefined>(undefined);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleBackClick = () => {
    navigate(-1);
  };

  // Find the submission for the breadcrumb title
  const currentSubmission = submissionVersions.find((sv) => sv.id === thisSubmissionVersionId);
  const workTitle = currentSubmission?.workVersion?.title || 'Untitled Work';
  const truncatedTitle = workTitle.length > 40 ? workTitle.substring(0, 40) + '...' : workTitle;

  // Check if there's a returnTo parameter to determine breadcrumb behavior
  const returnTo = searchParams.get('returnTo');

  const breadcrumbs: ui.BreadcrumbItemConfig[] = [
    {
      label: 'Inbox',
      ...(returnTo
        ? { href: decodeURIComponent(returnTo) } // Use direct navigation to preserve filters
        : { onBack: handleBackClick }), // Fallback to browser back
    },
    { label: truncatedTitle, isCurrentPage: true },
  ];

  function getFilesBySlot(row: any) {
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

  const currentWorkflowState = currentWorkflow.states[currentStatus];
  const currentMessage = currentWorkflowState.messages?.admin ?? currentWorkflowState.messages?.all;

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

  // Get the work version and submission version we're currently viewing
  const thisWorkVersion = submissionVersions.find(
    (sv) => sv.id === thisSubmissionVersionId,
  )?.workVersion;
  const currentSubmissionVersion = submissionVersions.find(
    (sv) => sv.id === thisSubmissionVersionId,
  );

  return (
    <PageFrame
      breadcrumbs={breadcrumbs}
      header={
        <FrameHeader
          title="PMC Deposit Details"
          description="The following page contains details on the deposit made by the submitter. You're able to see the information provided by the submitter and access the files. You can also contact the submitter to ask for changes."
        />
      }
      className="max-w-4xl"
    >
      <div className="space-y-12">
        <div className="space-y-4">
          <div className="space-y-1">
            <StatusTramline stops={tramline} ended={ended} lookahead={!ended} />
            {currentMessage ? (
              <ui.SimpleAlert
                type={alertType}
                size="compact"
                message={currentMessage}
                className=""
              />
            ) : undefined}
          </div>
          {currentSubmissionVersion && (
            <EmailProcessingAlert
              metadata={currentSubmissionVersion.metadata}
              workflow={currentWorkflow}
            />
          )}
          {currentSubmissionVersion && transitions.length > 0 && (
            <div className="flex justify-end">
              <ActionsAreaForm
                transitions={transitions}
                submissionVersion={currentSubmissionVersion}
                onError={setError}
                formAction="/app/sites/pmc/inbox"
                layout="horizontal"
              />
            </div>
          )}
          {error && <ui.ErrorMessage error={error} />}
        </div>
        <PublicationInfoCard workVersionId={thisWorkVersion?.id} />
        <PreviewMetadataSection pmc={metadata.pmc} showContactLinks />
        <FilesSection cdnKey={cdnKey} readonly hideEmpty hideAlerts />
        <SectionWithHeading heading="Versions" icon={GitBranch}>
          <primitives.Card lift>
            <DepositVersionsTable
              viewingSubmissionVersionId={thisSubmissionVersionId}
              submissionVersions={submissionVersions}
              workflow={currentWorkflow}
              renderDetails={(row: any) => {
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
