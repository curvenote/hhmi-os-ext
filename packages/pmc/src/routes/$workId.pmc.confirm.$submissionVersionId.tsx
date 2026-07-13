import {
  PageFrame,
  work as workScopes,
  getBrandingFromMetaMatches,
  joinPageTitle,
  ui,
  toCardinal,
  getWorkflow,
  type GeneralError,
} from '@curvenote/scms-core';
import { useFetcher, redirect, data } from 'react-router';
import { PublicationInfoCard } from '../components/PublicationInfoCard.js';
import { FilesSection } from '../components/FilesSection.js';
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { withSecureWorkContext, sites, SiteContextWithUser } from '@curvenote/scms-server';
import type { UserWithRolesDBO, WorkVersionDBO } from '@curvenote/scms-server';
import { confirmPMC } from '../backend/metadata/confirm.server.js';
import { syncManuscriptFileMappings } from '../backend/fileMappings.server.js';
import { getWorkflows } from '../client.js';
import { unsetPreviewDeposit } from '../backend/metadata/preview.server.js';
import {
  dbGetLatestNonDraftSubmissionVersionId,
  dbGetNumSubmissionVersions,
  dbGetSubmissionVersion,
  dbGetWorkVersion,
} from '../backend/db.server.js';
import { buildPmcDepositFormBreadcrumbs, truncateWorkTitle } from '../common/depositBreadcrumbs.js';
import { CertificationStatement } from '../components/CertificationStatement.js';
import { useState } from 'react';
import { GrantsInfo } from '../components/GrantsInfo.js';
import { formatDistanceToNow } from 'date-fns';
import { PMC_STATE_NAMES } from '../workflows.js';
import type { PMCWorkVersionMetadata } from '../common/validate.js';
import { validatePMCMetadata } from '../common/validate.js';
import { validateJournalAgainstNIH } from '../backend/services/nih-journal.server.js';
import { signPmcDisplayMetadata } from '../backend/metadata/utils.server.js';
import { getHHMIGrantOptions } from '../backend/hhmi-grants.server.js';
import type { WorkDTO } from '@curvenote/common';

interface LoaderData {
  work: WorkDTO;
  workVersionId: string;
  submissionVersionId: string;
  submissionStatus: string;
  numSubmissionVersions: number;
  parentSubmissionVersionId: string | null;
  cdnKey: string | null;
  metadata: PMCWorkVersionMetadata;
  user: UserWithRolesDBO;
  canPreview?: boolean;
  validationErrors: GeneralError[];
  grantOptions: Awaited<ReturnType<typeof getHHMIGrantOptions>>;
}

export const meta: MetaFunction<LoaderData> = ({ matches }) => {
  const branding = getBrandingFromMetaMatches(matches);
  return [{ title: joinPageTitle('Review & Confirm', branding.title) }];
};

export const loader = async (args: LoaderFunctionArgs): Promise<LoaderData | Response> => {
  const ctx = await withSecureWorkContext(args, [workScopes.id.submissions.read]);

  // Check if PMC extension is enabled in config
  if (!ctx.$config.app.extensions?.pmc) {
    return redirect('/app/works');
  }

  const { submissionVersionId } = args.params;
  if (!submissionVersionId) {
    return redirect(`/app/works/${ctx.work.id}`);
  }

  const submissionVersion = await dbGetSubmissionVersion(submissionVersionId);
  if (!submissionVersion) {
    return redirect(`/app/works/${ctx.work.id}`);
  }
  if (submissionVersion.work_version_id !== ctx.work.versions?.[0]?.id) {
    console.warn(
      `Submission version ${submissionVersionId} is not associated with work version ${ctx.work.versions?.[0]?.id}`,
    );
    return redirect(`/app/works/${ctx.work.id}`);
  }
  if (submissionVersion.status !== PMC_STATE_NAMES.DRAFT) {
    console.warn(
      `Submission version ${submissionVersionId} is not a draft. Status: ${submissionVersion.status}`,
    );
    return redirect(`/app/works/${ctx.work.id}`);
  }

  const workVersion = submissionVersion.work_version;
  const { id, cdn_key, metadata, cdn } = workVersion;
  const typedMetadata = metadata as PMCWorkVersionMetadata;
  const result = await validatePMCMetadata(typedMetadata);

  // multiple redirects based on pathname here because this loader is re-used for both deposit and confirm
  // and we need to handle the case where the user is redirected to the wrong page as well as redirects
  // during revalidation after form submit on those pages
  const pathname = new URL(args.request.url).pathname;
  if (pathname.includes('site/pmc/deposit') && typedMetadata.pmc?.previewed) {
    throw redirect(`/app/works/${ctx.work.id}/site/pmc/confirm/${submissionVersionId}`);
  }
  if (pathname.includes('site/pmc/confirm') && !typedMetadata.pmc?.previewed) {
    throw redirect(`/app/works/${ctx.work.id}/site/pmc/deposit/${submissionVersionId}`);
  }
  if (pathname.includes('site/pmc/confirm') && typedMetadata.pmc?.confirmed) {
    throw redirect(`/app/works/${ctx.work.id}/site/pmc/submission/${submissionVersionId}`);
  }

  // NEW: Validate journal name if present but no ISSN (page refresh scenario)
  let journalValidationError = null;
  const pmc = typedMetadata?.pmc;

  if (pmc?.journalName && !pmc?.issn) {
    // Manual entry case - validate journal name against NIH list
    const nihValidation = await validateJournalAgainstNIH(pmc.journalName);
    if (!nihValidation.isValid) {
      journalValidationError = {
        type: 'general',
        message: nihValidation.error || 'Journal not found in NIH Public Access list',
      };
    }
  }

  const metadataWithSigned = await signPmcDisplayMetadata(typedMetadata, cdn ?? '', ctx);

  // Get HHMI grant options for the UI
  const grantOptions = await getHHMIGrantOptions();

  const numSubmissionVersions = await dbGetNumSubmissionVersions(submissionVersion.submission_id);
  const parentSubmissionVersionId =
    numSubmissionVersions > 1
      ? await dbGetLatestNonDraftSubmissionVersionId(
          submissionVersion.submission_id,
          submissionVersionId,
        )
      : null;

  return {
    work: ctx.workDTO,
    workVersionId: id,
    submissionVersionId,
    submissionStatus: submissionVersion?.status,
    numSubmissionVersions,
    parentSubmissionVersionId,
    cdnKey: cdn_key,
    metadata: metadataWithSigned,
    user: ctx.user,
    canPreview: result.success && !journalValidationError,
    validationErrors: [result.error, journalValidationError].filter(
      (err): err is GeneralError => !!err,
    ),
    grantOptions,
  };
};

export async function action(args: ActionFunctionArgs) {
  const ctx = await withSecureWorkContext(args, [
    workScopes.id.submissions.read,
    workScopes.id.update,
  ]);

  let versionDbo: WorkVersionDBO | null = null;
  try {
    versionDbo = await dbGetWorkVersion(ctx, ctx.work.id);
    if (!versionDbo) {
      throw data(
        {
          error: {
            type: 'general',
            message: 'Work version not found',
            details: {
              workId: ctx.work.id,
            },
          },
        },
        { status: 400 },
      );
    }
  } catch (error) {
    return data({ error: { type: 'general', message: String(error) } }, { status: 500 });
  }

  const formData = await args.request.formData();
  const intent = formData.get('intent');
  switch (intent) {
    case 'confirm': {
      if (!ctx.user) {
        return data({ error: { type: 'general', message: 'User not found' } }, { status: 500 });
      }
      await syncManuscriptFileMappings(versionDbo.id);
      const confirmResult = await confirmPMC(ctx, versionDbo.id);
      if ('error' in confirmResult) {
        return data(
          { error: confirmResult.error },
          { status: confirmResult.error.type === 'general' ? 500 : 400 },
        );
      }

      // Automatically transition PENDING → DEPOSITED via send_to_pmc (invokes PMC_DEPOSIT_FTP job)
      try {
        const site = await sites.dbGetSite('pmc');
        if (site) {
          const siteCtx = new SiteContextWithUser(ctx, site);
          const submissionVersionForTransition =
            await sites.submissions.versions.dbGetLatestSubmissionVersionFromSubmission(
              'pmc',
              confirmResult.submissionId,
              'PENDING',
            );
          if (submissionVersionForTransition) {
            const workflow = getWorkflow(
              ctx.$config,
              [getWorkflows()],
              submissionVersionForTransition.submission.collection.workflow,
            );
            await sites.submissions.versions.transition(
              siteCtx,
              submissionVersionForTransition,
              workflow,
              PMC_STATE_NAMES.DEPOSITED,
            );
          }
        }
      } catch (autoTransitionError) {
        console.error('Auto transition PENDING → send_to_pmc failed:', autoTransitionError);
        // Confirm already succeeded; do not fail the request
      }
      return data({ success: true });
    }
    case 'edit-deposit':
      return unsetPreviewDeposit(versionDbo.id);
  }
  return data({ error: { type: 'general', message: `Invalid intent ${intent}` } }, { status: 400 });
}

function ConfirmButton({ onError }: { onError: (error: GeneralError | null) => void }) {
  const fetcher = useFetcher<{ success?: boolean; error?: GeneralError }>();

  // Handle errors
  if (fetcher.data?.error && fetcher.state === 'idle') {
    onError(fetcher.data.error);
  }

  // Clear errors on submit
  const handleSubmit = () => {
    onError(null);
  };

  return (
    <fetcher.Form method="post" onSubmit={handleSubmit}>
      <input type="hidden" name="intent" value="confirm" />
      <ui.StatefulButton
        type="submit"
        overlayBusy
        busy={fetcher.state === 'submitting' || fetcher.state === 'loading'}
      >
        Confirm and Deposit
      </ui.StatefulButton>
    </fetcher.Form>
  );
}

function GoBackButton({ onError }: { onError: (error: GeneralError | null) => void }) {
  const fetcher = useFetcher<{ success?: boolean; error?: GeneralError }>();

  // Handle errors
  if (fetcher.data?.error && fetcher.state === 'idle') {
    onError(fetcher.data.error);
  }

  // Clear errors on submit
  const handleSubmit = () => {
    onError(null);
  };

  return (
    <fetcher.Form method="post" onSubmit={handleSubmit}>
      <input type="hidden" name="intent" value="edit-deposit" />
      <ui.StatefulButton
        variant="outline"
        type="submit"
        overlayBusy
        busy={fetcher.state && fetcher.state !== 'idle'}
      >
        No, go back and edit
      </ui.StatefulButton>
    </fetcher.Form>
  );
}

export default function PMCConfirm({ loaderData }: { loaderData: LoaderData }) {
  const { work, cdnKey, numSubmissionVersions, parentSubmissionVersionId } = loaderData;
  const [error, setError] = useState<GeneralError | null>(null);

  const breadcrumbs =
    numSubmissionVersions > 1
      ? buildPmcDepositFormBreadcrumbs({
          workId: work.id,
          workTitle: work.title,
          isNewVersion: true,
          parentSubmissionVersionId,
          newVersionCurrentPageLabel: 'Confirm',
        })
      : [
          { label: 'Home', href: '/app/dashboard' },
          { label: truncateWorkTitle(work.title), href: `/app/works/${work.id}` },
          { label: 'Confirm', isCurrentPage: true },
        ];

  return (
    <PageFrame
      className="mx-auto max-w-4xl"
      title="Everything look OK?"
      description="Please review the information below and confirm that you would like to deposit your manuscript at PMC."
      breadcrumbs={breadcrumbs}
    >
      {numSubmissionVersions > 1 && (
        <ui.SimpleAlert
          type="info"
          message={
            <div>
              This is the{' '}
              <span className="font-semibold">{toCardinal(numSubmissionVersions)} version</span> of
              your deposit. You started working on this version{' '}
              <span className="font-semibold">
                {formatDistanceToNow(new Date(work.date_created), { addSuffix: true })}
              </span>
              .
            </div>
          }
          size="compact"
        />
      )}
      <div className="space-y-6">
        <h2>Publication Information</h2>
        <PublicationInfoCard />
      </div>
      <GrantsInfo readonly />
      <FilesSection cdnKey={cdnKey} readonly hideEmpty />
      <CertificationStatement />
      <div className="space-y-2">
        <div className="flex gap-4 justify-start items-center">
          <ConfirmButton onError={setError} />
          <GoBackButton onError={setError} />
        </div>
        {error && <ui.SmallErrorTray error={error.message} />}
      </div>
    </PageFrame>
  );
}
