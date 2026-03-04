import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data as dataResponse } from 'react-router';
import type { Workflow, WorkflowRegistration } from '@curvenote/scms-core';
import {
  PageFrame,
  getBrandingFromMetaMatches,
  joinPageTitle,
  getWorkflow,
  scopes,
} from '@curvenote/scms-core';
import { withAppPMCContext } from '../../backend/context.server.js';
import { withValidFormData, sites } from '@curvenote/scms-server';
import { getWorkflows, getEmailTemplates } from '../../client.js';
import { TransitionFormSchema } from '../../components/ActionsArea.js';
import { PMC_STATE_NAMES } from '../../workflows.js';
import { PMC_REQUEST_NEW_VERSION_BY_TEAM } from '../../backend/emails/request-new-version-by-team.js';
import { SubmissionList } from './SubmissionList.js';
import { dbListPMCSubmissionsWithLatestNonDraftVersion } from './db.server.js';

interface LoaderData {
  items: ReturnType<typeof dbListPMCSubmissionsWithLatestNonDraftVersion>;
  workflows: Workflow[];
}

export const meta: MetaFunction<LoaderData> = ({ matches }) => {
  const branding = getBrandingFromMetaMatches(matches);
  return [{ title: joinPageTitle('PMC Admin Inbox', branding.title) }];
};

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
  const ctx = await withAppPMCContext(args, [scopes.site.read, scopes.site.submissions.list]);

  // Load all submissions data with deferred loading, except for incomplete versions
  const itemsPromise = dbListPMCSubmissionsWithLatestNonDraftVersion(ctx);
  const workflows = getWorkflows().workflows;

  return {
    items: itemsPromise,
    workflows,
  };
}

export async function action(args: ActionFunctionArgs) {
  const ctx = await withAppPMCContext(args, [scopes.site.submissions.update]);

  const formData = await args.request.formData();
  return withValidFormData(
    TransitionFormSchema,
    formData,
    async (data) => {
      const { intent, submissionVersionId, transition } = data;

      const submissionVersion = await sites.submissions.versions.dbGetSubmissionVersion({
        id: submissionVersionId,
      });

      if (!submissionVersion) {
        return dataResponse(
          {
            error: {
              message:
                'Cannot find submission version [site: ' +
                ctx.site.name +
                ', id: ' +
                submissionVersionId +
                ']',
              details: {
                id: submissionVersionId,
                siteId: ctx.site.id,
                siteName: ctx.site.name,
              },
            },
          },
          { status: 400 },
        );
      }

      const extensionWorkflows: WorkflowRegistration[] = [getWorkflows()];
      const workflow = getWorkflow(
        ctx.$config,
        extensionWorkflows,
        submissionVersion.submission.collection.workflow,
      );

      const transitionItem = workflow?.transitions.find((t) => t.name === transition);

      if (!transitionItem) {
        return dataResponse(
          {
            error: {
              message: `Invalid transition [${transition}, workflow: ${workflow?.name ?? 'unknown'}]`,
              details: {
                id: submissionVersionId,
                siteName: ctx.site.name,
                workflowName: workflow?.name,
                transition,
              },
            },
          },
          { status: 400 },
        );
      }

      try {
        switch (intent) {
          case 'transition': {
            // Update the submission version status
            const item = await sites.submissions.versions.transition(
              ctx,
              submissionVersion,
              workflow,
              transitionItem.targetStateName,
            );

            // When UI triggers "Request new version", send email to submitter
            if (transitionItem.targetStateName === PMC_STATE_NAMES.REQUEST_NEW_VERSION) {
              const submitter = submissionVersion.submitted_by;
              const supportEmail = ctx.$config.app?.branding?.supportEmail;

              if (submitter?.email && supportEmail) {
                const depositUrl = ctx.asBaseUrl(
                  `/app/works/${submissionVersion.work_version.work_id}/site/pmc/deposit/${submissionVersion.id}`,
                );
                try {
                  await ctx.sendEmail(
                    {
                      eventType: PMC_REQUEST_NEW_VERSION_BY_TEAM,
                      to: submitter.email,
                      subject: 'New version requested for your PMC deposit',
                      templateProps: {
                        submitterName: submitter.display_name ?? undefined,
                        depositUrl,
                        supportEmail,
                      },
                      ignoreUnsubscribe: false,
                    },
                    getEmailTemplates(),
                  );
                } catch (emailError) {
                  console.error(
                    'Failed to send request new version (by team) notification email:',
                    emailError,
                  );
                }
              }
            }

            return { success: true, item };
          }
          default:
            return dataResponse({ error: `Invalid intent [${intent}]` }, { status: 400 });
        }
      } catch (err: any) {
        return dataResponse(
          {
            error: {
              message: err.message ?? err.statusText ?? err.toString(),
            },
          },
          { status: err.status ?? 500 },
        );
      }
    },
    { errorFields: { type: 'general', intent: 'transition' } },
  );
}

export default function PMCInbox({ loaderData }: { loaderData: LoaderData }) {
  const { items, workflows } = loaderData;

  return (
    <PageFrame title="Admin Inbox" className="max-w-none">
      <div className="mt-12 space-y-6">
        <SubmissionList submissions={items} workflows={workflows} siteName="pmc" />
      </div>
    </PageFrame>
  );
}
