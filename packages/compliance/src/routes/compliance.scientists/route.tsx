import { PageFrame, MainWrapper } from '@curvenote/scms-core';
import { withAppScopedContext, withValidFormData, validateFormData } from '@curvenote/scms-server';
import { fetchAllScientists } from '../../backend/airtable.scientists.server.js';
import { hhmi } from '../../backend/scopes.js';
import { ScientistsList } from '../../components/ScientistList.js';
import type { NormalizedScientist } from '../../backend/types.js';
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
}

// Module-level cache for scientist data
let scientistCache: NormalizedScientist[] | null = null;

/**
 * Retry a function with fixed delays, only retrying on timeout errors.
 * @param fn - The function to retry
 * @param delays - Array of delays in milliseconds between retries (default: [500, 1000])
 * @returns The result of the function
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  delays: number[] = [500, 1000],
): Promise<T> {
  let lastError: Error | unknown;

  // Total attempts = initial attempt + number of retries (delays.length)
  const maxAttempts = delays.length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Only retry on timeout errors
      const isTimeoutError =
        error instanceof Error &&
        (error.message.includes('Server Timeout') ||
          error.message.includes('timeout') ||
          error.message.includes('Timeout'));

      // Don't retry if it's not a timeout error or we've exhausted retries
      if (!isTimeoutError || attempt === maxAttempts - 1) {
        throw error;
      }

      // Get the delay for this retry attempt
      const delay = delays[attempt];
      console.warn(
        `ServerLoader timeout (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delay}ms...`,
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

export const meta = () => {
  return [
    { title: 'Compliance Dashboard' },
    { name: 'description', content: 'View compliance data for all scientists' },
  ];
};

export const loader = async (args: LoaderFunctionArgs): Promise<LoaderData> => {
  await withAppScopedContext(args, [hhmi.compliance.admin]);
  const scientists = fetchAllScientists();
  return { scientists };
};

export const clientLoader = async (args: ClientLoaderFunctionArgs): Promise<LoaderData> => {
  // If we have cached data, return it immediately
  if (scientistCache !== null) {
    return { scientists: Promise.resolve(scientistCache) };
  }

  // No cache, call server loader with retry logic
  const serverData = await retryWithBackoff(
    () => args.serverLoader<LoaderData>(),
    [500, 1000], // 2 retries: 500ms delay, then 1s delay
  );

  // Cache the scientist data vis fire and forget
  serverData.scientists.then((resolvedScientists: any) => {
    scientistCache = resolvedScientists;
  });

  // Return the same promise structure
  return { scientists: serverData.scientists };
};

// Note: We intentionally do NOT set clientLoader.hydrate = true
// this gives us cached data on client-side navigation, just not during initial page load.
// clientLoader.hydrate = true as const;

/**
 * Intent types for admin compliance actions
 */
const AdminComplianceIntent = z.enum(['get-access-grants', 'share', 'revoke', 'invite-new-user']);

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

export function shouldRevalidate(args?: { formAction?: string; [key: string]: any }) {
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
    { label: 'Compliance', href: '/app/compliance' },
    { label: 'Compliance Management', isCurrentPage: true },
  ];

  return (
    <MainWrapper>
      <PageFrame
        title="Compliance Dashboard"
        description="View compliance data for any scientist in the compliance database"
        className="mx-auto max-w-screen-lg"
        breadcrumbs={breadcrumbs}
      >
        <ScientistsList scientists={scientists} />
      </PageFrame>
    </MainWrapper>
  );
}
