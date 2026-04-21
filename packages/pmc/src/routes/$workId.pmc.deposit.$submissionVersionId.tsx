import { redirect, useFetcher, Link, data } from 'react-router';
import { withSecureWorkContext, safeWorkVersionJsonUpdate } from '@curvenote/scms-server';
import {
  PageFrame,
  work as workScopes,
  getBrandingFromMetaMatches,
  joinPageTitle,
  ui,
  toCardinal,
  coerceToObject,
} from '@curvenote/scms-core';
import { FilesSection } from '../components/FilesSection.js';
import { PublicationInfoForm } from '../components/PublicationInfoForm.js';
import { PMCReviewerInfo } from '../components/PMCReviewerInfo.js';
import { validateAndHandleUploads } from '../backend/uploads.server.js';
import { GrantsInfo } from '../components/GrantsInfo.js';
import type { UserWithRolesDBO, WorkVersionDBO } from '@curvenote/scms-server';
import {
  resetPublicationMetadata,
  updatePublicationJournalName,
  updatePublicationMetadataByDoi,
  updatePublicationTitle,
} from '../backend/metadata/publication.server.js';
import {
  addGrant,
  removeGrant,
  setInitialHHMIGrant,
  clearInitialHHMIGrant,
} from '../backend/metadata/grants.server.js';
import { getHHMIGrantOptions } from '../backend/hhmi-grants.server.js';

import {
  updateReviewerEmail,
  updateReviewerLastName,
  updateReviewerFirstName,
  removeReviewer,
  updateDesignateReviewer,
} from '../backend/metadata/reviewer.server.js';
import { CertifyManuscript } from '../components/CertifyManuscript.js';
import { updateCertifyManuscript } from '../backend/metadata/certify.server.js';
import type { GeneralError } from '@curvenote/scms-core';
import { setPreviewDeposit } from '../backend/metadata/preview.server.js';
import type { PMCWorkVersionMetadata } from '../common/validate.js';
import { validatePMCMetadata } from '../common/validate.js';
import {
  dbGetNumSubmissionVersions,
  dbGetSubmissionVersion,
  dbGetWorkVersion,
} from '../backend/db.server.js';
import { signFilesInMetadata } from '../backend/metadata/utils.server.js';
import { validateJournalAgainstNIH } from '../backend/services/nih-journal.server.js';
import { ValidationReport } from '../components/ValidationReport.js';
import type { ZodIssue } from 'zod';
import { PMC_STATE_NAMES } from '../workflows.js';
import { formatDistanceToNow } from 'date-fns';
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from 'react-router';
import type { WorkDTO } from '@curvenote/common';

interface LoaderData {
  work: WorkDTO;
  workVersionId: string;
  submissionVersionId: string;
  submissionStatus: string;
  numSubmissionVersions: number;
  cdnKey: string | null;
  metadata: PMCWorkVersionMetadata;
  user: UserWithRolesDBO;
  canPreview?: boolean;
  validationErrors: GeneralError[];
  grantOptions: Awaited<ReturnType<typeof getHHMIGrantOptions>>;
}

export const meta: MetaFunction<LoaderData> = ({ matches }) => {
  const branding = getBrandingFromMetaMatches(matches);
  return [{ title: joinPageTitle('Create a PMC Deposit', branding.title) }];
};

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData | Response> {
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

  const { id, cdn_key, metadata, cdn } = ctx.work.versions?.[0] || {};
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

  const metadataWithSigned = await signFilesInMetadata(typedMetadata, cdn ?? '', ctx);

  // Get HHMI grant options for the UI
  const grantOptions = await getHHMIGrantOptions();

  const numSubmissionVersions = await dbGetNumSubmissionVersions(submissionVersion.submission_id);

  return {
    work: ctx.workDTO,
    workVersionId: id,
    submissionVersionId,
    submissionStatus: submissionVersion?.status,
    numSubmissionVersions,
    cdnKey: cdn_key,
    metadata: metadataWithSigned,
    user: ctx.user,
    canPreview: result.success && !journalValidationError,
    validationErrors: [result.error, journalValidationError].filter(
      (err): err is GeneralError => !!err,
    ),
    grantOptions,
  };
}

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
    if (!versionDbo.draft) {
      throw data(
        { error: { type: 'general', message: 'Work version is not a draft' } },
        { status: 422 },
      );
    }
  } catch (error) {
    return error; // return for errors, otherwise ErrorBoundary will catch
  }

  if (!versionDbo.cdn) {
    throw data(
      { error: { type: 'general', message: 'Work version has no CDN defined' } },
      { status: 422 },
    );
  }

  const formData = await args.request.formData();
  const intent = formData.get('intent');
  try {
    switch (intent) {
      case 'stage':
      case 'complete':
      case 'remove':
        return validateAndHandleUploads(ctx, formData, intent, versionDbo.id, versionDbo.cdn);
      case 'publication-doi-lookup':
        return updatePublicationMetadataByDoi(ctx, formData, versionDbo.id);
      case 'publication-reset':
        return resetPublicationMetadata(formData, versionDbo.id);
      case 'publication-title-update':
        return updatePublicationTitle(formData, versionDbo.id);
      case 'publication-journal-name-update':
        return updatePublicationJournalName(formData, versionDbo.id);
      case 'grant-add':
        return addGrant(formData, versionDbo.id);
      case 'grant-remove':
        return removeGrant(formData, versionDbo.id);
      case 'initial-hhmi-grant-set':
        return setInitialHHMIGrant(formData, versionDbo.id);
      case 'initial-hhmi-grant-clear':
        return clearInitialHHMIGrant(formData, versionDbo.id);
      case 'reviewer-first-name':
        return updateReviewerFirstName(formData, versionDbo.id);
      case 'reviewer-last-name':
        return updateReviewerLastName(formData, versionDbo.id);
      case 'reviewer-email':
        return updateReviewerEmail(formData, versionDbo.id);
      case 'reviewer-remove':
        return removeReviewer(formData, versionDbo.id);
      case 'designate-reviewer':
        return updateDesignateReviewer(formData, versionDbo.id);
      case 'certify-manuscript':
        return updateCertifyManuscript(formData, versionDbo.id);
      case 'preview-deposit': {
        // UI will be pre validation using the same schemasin a friendly way
        // repeated validation here is secondary but to cover independent POSTs
        const result = await validatePMCMetadata(versionDbo.metadata as PMCWorkVersionMetadata);
        if (result.error) {
          // Return comprehensive validation errors for better UX
          return data(
            {
              success: false,
              validationErrors: result.validationErrors || [],
              error: result.error,
            },
            { status: 400 },
          );
        }
        return setPreviewDeposit(ctx, versionDbo.id);
      }
      case 'edit-label': {
        const slot = formData.get('slot') as string;
        const path = formData.get('path') as string;
        let value = (formData.get('value') as string) || '';
        if (!slot || !path) {
          return data(
            { error: { type: 'general', message: 'Missing slot or path' } },
            { status: 400 },
          );
        }

        // Validate label
        value = value.trim();
        if (!value) {
          // Regenerate from file name
          value =
            path
              .split('/')
              .pop()
              ?.replace(/\.[^/.]+$/, '') || 'untitled';
        }

        // Use the same validation as the frontend
        const allowed = /^[a-zA-Z0-9 .,&()_-]+$/;
        if (!allowed.test(value)) {
          return data(
            {
              error: {
                type: 'validation',
                message:
                  'Invalid characters: only letters, numbers, spaces, . , & ( ) - _ allowed.',
              },
            },
            { status: 400 },
          );
        }

        // OCC-safe update
        try {
          await safeWorkVersionJsonUpdate(versionDbo.id, (metadata: any) => {
            const updatedMeta = coerceToObject(metadata);
            if (!updatedMeta.files || !updatedMeta.files[path]) return updatedMeta;

            // Uniqueness check - only within the same slot
            const slotLabels = Object.values(updatedMeta.files)
              .filter((f: any) => f.slot === slot && f.path !== path) // Same slot, exclude current file
              .map((f: any) => f.label)
              .filter(Boolean);
            if (slotLabels.includes(value)) {
              throw new Error('Each label must be unique within this slot.');
            }

            updatedMeta.files[path].label = value;
            return updatedMeta;
          });

          return { success: true };
        } catch (error) {
          if (error instanceof Error) {
            return data({ error: { type: 'validation', message: error.message } }, { status: 400 });
          }
          return data(
            { error: { type: 'general', message: 'Failed to update label' } },
            { status: 500 },
          );
        }
      }

      default:
        return data(
          { error: { type: 'general', message: `Invalid intent ${intent}` } },
          { status: 400 },
        );
    }
  } catch (error) {
    if (error instanceof Error) {
      return data({ error: error.message }, { status: 404 });
    }
    return data({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

export default function PMCDeposit({ loaderData }: { loaderData: LoaderData }) {
  const { work, cdnKey, metadata, numSubmissionVersions } = loaderData;
  const validationFetcher = useFetcher<{
    success?: boolean;
    error?: GeneralError;
    validationErrors?: ZodIssue[];
  }>();

  const validateFormAndContinue = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    validationFetcher.submit({ intent: 'preview-deposit' }, { method: 'post' });
  };

  const firstName = metadata.pmc?.ownerFirstName ?? '';
  const lastName = metadata.pmc?.ownerLastName ?? '';
  const email = metadata.pmc?.ownerEmail ?? '';

  const breadcrumbs = [
    { label: 'Home', href: '/app/dashboard' },
    { label: 'Deposit Form', isCurrentPage: true },
  ];

  return (
    <PageFrame
      className="mx-auto max-w-4xl"
      title="Deposit manuscript to PMC"
      description="Upload all files associated with this manuscript, including any referenced figure, table, video, or supplementary files."
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
              </span>{' '}
              and have <span className="font-semibold">not</span> submitted it yet.
            </div>
          }
          size="compact"
        />
      )}
      <PublicationInfoForm />
      <FilesSection cdnKey={cdnKey} />
      <CertifyManuscript />
      <GrantsInfo />
      <PMCReviewerInfo currentUser={{ firstName, lastName, email }} />
      <ValidationReport fetcher={validationFetcher} />
      <div className="flex gap-4 justify-start items-center">
        <validationFetcher.Form method="post" onSubmit={validateFormAndContinue}>
          <input type="hidden" name="intent" value="preview-deposit" />
          <ui.StatefulButton type="submit" overlayBusy busy={validationFetcher.state !== 'idle'}>
            Preview Deposit
          </ui.StatefulButton>
        </validationFetcher.Form>
        <ui.Button variant="link" asChild>
          <Link to="/app">Come back and finish this later</Link>
        </ui.Button>
      </div>
    </PageFrame>
  );
}
