import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect, data } from 'react-router';
import {
  withAppContext,
  dangerouslyHardDeleteDraftSubmissionVersions,
  dbCreateDraftSubmission,
} from '@curvenote/scms-server';
import { httpError, WorkContents } from '@curvenote/scms-core';
import {
  dbCreateDraftPMCWork,
  dbGetPMCSite,
  dbGetUserDraftPMCDeposits,
} from '../backend/db.server.js';
import { PMCDepositLauncher } from '../PMCDepositLauncher.js';
import {
  isPmcRoutesEnabled,
  buildPmcCreateDepositSuccessActionData,
} from '../pmcDepositLauncherState.js';

export async function loader(args: LoaderFunctionArgs) {
  const ctx = await withAppContext(args);
  if (!isPmcRoutesEnabled(ctx.$config)) {
    return redirect('/app/works');
  }
  return {};
}

export default function PMCDepositLauncherRoute() {
  return <PMCDepositLauncher />;
}

export async function action(args: ActionFunctionArgs) {
  const ctx = await withAppContext(args);

  if (args.request.method !== 'POST') throw httpError(405, 'Method not allowed');

  if (!isPmcRoutesEnabled(ctx.$config)) {
    return data({ error: 'Endpoint not found' }, { status: 404 });
  }

  const formData = await args.request.formData();
  const intent = formData.get('intent') as string;

  // Handle different intents
  if (intent === 'delete-draft') {
    const workId = formData.get('workId') as string;

    if (!workId) {
      return data({ error: 'Work ID is required for delete operation' }, { status: 400 });
    }

    try {
      await dangerouslyHardDeleteDraftSubmissionVersions(ctx, 'pmc', workId, ctx.user.id, {
        deleteDraftWorkVersions: true,
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to delete draft deposit:', error);
      return data(
        {
          error: {
            type: 'general',
            message: error instanceof Error ? error.message : 'Failed to delete draft deposit',
          },
        },
        { status: 500 },
      );
    }
  }

  if (intent === 'get-drafts') {
    try {
      const drafts = await dbGetUserDraftPMCDeposits(ctx.user.id);
      return { drafts };
    } catch (error) {
      console.error('Failed to get draft deposits:', error);
      return data(
        {
          error: {
            type: 'general',
            message: 'Failed to retrieve draft deposits',
          },
        },
        { status: 500 },
      );
    }
  }

  if (intent === 'delete-all-drafts') {
    try {
      // Get all draft PMC deposits
      const drafts = await dbGetUserDraftPMCDeposits(ctx.user.id);

      // Delete each draft
      const deleteResults = await Promise.allSettled(
        drafts.map((draft) =>
          dangerouslyHardDeleteDraftSubmissionVersions(ctx, 'pmc', draft.workId, ctx.user.id, {
            deleteDraftWorkVersions: true,
          }),
        ),
      );

      // Count successes and failures
      const succeeded = deleteResults.filter((r) => r.status === 'fulfilled').length;
      const failed = deleteResults.filter((r) => r.status === 'rejected').length;

      if (failed > 0) {
        console.warn(`Failed to delete ${failed} out of ${drafts.length} PMC draft deposits`);
      }

      return {
        success: true,
        intent,
        deleted: succeeded,
        failed,
      };
    } catch (error) {
      console.error('Failed to delete all draft deposits:', error);
      return data(
        {
          success: false,
          intent,
          error: error instanceof Error ? error.message : 'Failed to delete all draft deposits',
        },
        { status: 500 },
      );
    }
  }

  if (intent === 'resume-draft') {
    const workId = formData.get('workId') as string;
    const submissionVersionId = formData.get('submissionVersionId') as string;

    if (!workId || !submissionVersionId) {
      return data({ error: 'Work ID and Submission Version ID are required' }, { status: 400 });
    }

    return redirect(`/app/works/${workId}/site/pmc/deposit/${submissionVersionId}`);
  }

  // Default behavior: create new draft (existing logic)
  // Check if PMC site exists
  const pmcSite = await dbGetPMCSite();

  if (!pmcSite) {
    return data(
      {
        error: {
          type: 'general',
          message: 'PMC site not found. Please contact system administrator.',
        },
      },
      { status: 500 },
    );
  }

  let work: Awaited<ReturnType<typeof dbCreateDraftPMCWork>> | undefined;
  let submission: Awaited<ReturnType<typeof dbCreateDraftSubmission>> | undefined;
  try {
    work = await dbCreateDraftPMCWork(
      ctx,
      'New PMC Deposit',
      'A draft PMC deposit where files and metadata are being brought together ready for submission.',
      [WorkContents.FILES],
    );
    submission = await dbCreateDraftSubmission(ctx.user, work, 'pmc');
  } catch (error) {
    console.error('Failed to create draft PMC work/submission:', error);
    return data(
      {
        error: {
          type: 'general',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to create draft PMC work/submission. Please try again.',
          details: error,
        },
      },
      { status: 500 },
    );
  }

  // Return JSON for fetcher.submit — server redirects are not followed as browser navigation.
  return buildPmcCreateDepositSuccessActionData(work.id, submission.versions[0].id);
}
