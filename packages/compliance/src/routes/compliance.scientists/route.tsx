import { PageFrame, MainWrapper } from '@curvenote/scms-core';
import { withAppScopedContext, withValidFormData, validateFormData } from '@curvenote/scms-server';
import { getScientistsFromCacheOrFetch } from '../../backend/airtable-cache.server.js';
import { hhmi } from '../../backend/scopes.js';
import { ScientistsList } from '../../components/ScientistList.js';
import { UpdateAirtableCacheButton } from '../../components/UpdateAirtableCacheButton.js';
import type { NormalizedScientist, ComplianceUserMetadataSection } from '../../backend/types.js';
import { isUserComplianceManager } from '../../utils/analytics.server.js';
import {
  getScientistAccessGrants,
  handleAdminShareComplianceReport,
  handleAdminRevokeComplianceAccess,
} from './actionHelpers.server.js';
import { handleInviteNewUser } from '../compliance.share/actionHelpers.server.js';
import { z } from 'zod';
import { zfd } from 'zod-form-data';
import { data } from 'react-router';
import type {
  ActionFunctionArgs,
  ClientLoaderFunctionArgs,
  LoaderFunctionArgs,
} from 'react-router';

interface LoaderData {
  scientists: Promise<NormalizedScientist[]>;
  complianceRole?: 'scientist' | 'lab-manager';
  path?: string;
  isComplianceManager?: boolean;
}

export const meta = () => {
  return [
    { title: 'Management - My Compliance' },
    { name: 'description', content: 'View compliance data for all scientists' },
  ];
};

export const loader = async (args: LoaderFunctionArgs): Promise<LoaderData> => {
  const ctx = await withAppScopedContext(args, [hhmi.compliance.admin]);
  const scientists = getScientistsFromCacheOrFetch();
  const userData = (ctx.user.data as ComplianceUserMetadataSection) || { compliance: {} };
  const complianceRole = userData.compliance?.role;
  const path = new URL(args.request.url).pathname;
  return {
    scientists,
    complianceRole,
    path,
    isComplianceManager: isUserComplianceManager(ctx.user),
  };
};

export const clientLoader = async (args: ClientLoaderFunctionArgs): Promise<LoaderData> => {
  // Server loader is cache-backed (DB); use it for client-side navigation too.
  return args.serverLoader<LoaderData>();
};

/**
 * Intent types for admin compliance actions
 */
const AdminComplianceIntent = z.enum([
  'get-access-grants',
  'share',
  'revoke',
  'invite-new-user',
  'update-airtable-cache',
]);

/**
 * Base intent schema to validate the intent field
 */
const IntentSchema = zfd.formData({
  intent: AdminComplianceIntent,
});

/**
 * Schema for getting access grants
 */
const GetAccessGrantsSchema = zfd.formData({
  intent: z.literal('get-access-grants'),
  orcid: z.string().min(1, 'ORCID is required'),
});

/**
 * Schema for sharing a compliance report
 */
const ShareSchema = zfd.formData({
  intent: z.literal('share'),
  orcid: z.string().min(1, 'ORCID is required'),
  recipientUserId: z.string().min(1, 'Recipient user ID is required'),
});

/**
 * Schema for revoking access
 */
const RevokeSchema = zfd.formData({
  intent: z.literal('revoke'),
  accessId: z.string().min(1, 'Access ID is required'),
});

/**
 * Schema for inviting a new user
 */
const InviteNewUserSchema = zfd.formData({
  intent: z.literal('invite-new-user'),
  email: z.email({ message: 'Valid email is required' }),
  message: z.string().optional(),
  orcid: z.string().optional(),
});

/**
 * Schema for triggering Airtable cache update (calls webhook, then revalidates)
 */
const UpdateAirtableCacheSchema = zfd.formData({
  intent: z.literal('update-airtable-cache'),
});

export function shouldRevalidate(args?: {
  formAction?: string;
  actionResult?: { updateCache?: boolean };
  [key: string]: unknown;
}) {
  // After update-airtable-cache, revalidate so loader reads fresh data from Object cache
  if (
    args?.actionResult &&
    typeof args.actionResult === 'object' &&
    args.actionResult.updateCache
  ) {
    return true;
  }
  // Prevent revalidation for admin sharing actions to avoid closing dialogs and unnecessary reloads
  const formAction = args?.formAction;
  if (
    formAction &&
    typeof formAction === 'string' &&
    formAction.includes('/compliance/scientists')
  ) {
    return false;
  }
  return true;
}

export async function action(args: ActionFunctionArgs) {
  // this action needs to handle sharing a report with another user
  // which can only be done if the user has the hhmi.compliance.admin scope
  const ctx = await withAppScopedContext(args, [hhmi.compliance.admin]);

  const formData = await args.request.formData();

  // Validate intent first
  let intentData;
  try {
    intentData = validateFormData(IntentSchema, formData);
  } catch (error: any) {
    return data(
      {
        error: {
          type: 'validation',
          message: error.message ?? 'Invalid intent',
        },
      },
      { status: 400 },
    );
  }

  const intent = intentData.intent;

  // Simulate slow response for testing
  await new Promise((resolve) => setTimeout(resolve, 1000));

  switch (intent) {
    case 'get-access-grants': {
      return withValidFormData(GetAccessGrantsSchema, formData, async (payload) => {
        return getScientistAccessGrants(ctx, payload.orcid);
      });
    }

    case 'share': {
      return withValidFormData(ShareSchema, formData, async (payload) => {
        return handleAdminShareComplianceReport(ctx, payload.orcid, payload.recipientUserId);
      });
    }

    case 'revoke': {
      return withValidFormData(RevokeSchema, formData, async (payload) => {
        return handleAdminRevokeComplianceAccess(ctx, payload.accessId);
      });
    }

    case 'invite-new-user': {
      return withValidFormData(InviteNewUserSchema, formData, async (payload) => {
        return handleInviteNewUser(ctx, payload.email, payload.message, payload.orcid);
      });
    }

    case 'update-airtable-cache': {
      const parsed = UpdateAirtableCacheSchema.safeParse(Object.fromEntries(formData));
      if (!parsed.success) {
        return data(
          { error: { type: 'validation', message: parsed.error.message } },
          { status: 400 },
        );
      }
      const cronSecret = ctx.$config.api.vercel?.cron?.secret;
      if (!cronSecret) {
        return data(
          { error: { type: 'config', message: 'Webhook secret not configured' } },
          { status: 503 },
        );
      }
      const origin = new URL(args.request.url).origin;
      const webhookUrl = `${origin}/v1/hooks/force-airtable-cache`;
      try {
        const res = await fetch(webhookUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${cronSecret}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message =
            (body as { error?: string })?.error || res.statusText || `HTTP ${res.status}`;
          return data(
            { error: { type: 'webhook', message } },
            { status: res.status >= 500 ? 503 : 400 },
          );
        }
        return data({ updateCache: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to call webhook';
        return data({ error: { type: 'webhook', message } }, { status: 503 });
      }
    }

    default:
      return data(
        {
          error: {
            type: 'validation',
            message: 'Invalid action',
          },
        },
        { status: 400 },
      );
  }
}

export default function CompliancePage({ loaderData }: { loaderData: LoaderData }) {
  const { scientists } = loaderData;

  const breadcrumbs = [
    { label: 'My Compliance', href: '/app/compliance' },
    { label: 'Compliance Management', isCurrentPage: true },
  ];

  return (
    <MainWrapper>
      <PageFrame
        title="Compliance Management"
        description="View compliance data for any scientist in the compliance database"
        className="pb-0 mx-auto mb-0 max-w-screen-lg"
        containerClassName="space-y-0"
        breadcrumbs={breadcrumbs}
      >
        <UpdateAirtableCacheButton />
        <ScientistsList scientists={scientists} />
      </PageFrame>
    </MainWrapper>
  );
}
