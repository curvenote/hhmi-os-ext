import type { LoaderFunction } from 'react-router';
import { data } from 'react-router';
import { withContext, sites, getUserById, enqueueAndDispatchJob } from '@curvenote/scms-server';
import { error404, error405, httpError } from '@curvenote/scms-core';
import { uuidv7 } from 'uuidv7';

export const loader: LoaderFunction = async (args) => {
  const ctx = await withContext(args, { noTokens: true });

  // Verify the authorization header for Vercel cron security
  const authHeader = args.request.headers.get('authorization');
  const expectedSecret = ctx.$config.api.vercel?.cron?.secret;

  if (!expectedSecret) {
    console.error('Vercel cron secret not configured');
    throw error404();
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    console.error('Invalid authorization header for PMC workflow sync');
    return data({ error: 'Unauthorized' }, { status: 401 });
  }

  // we are now authorized but need to manually get the service account user
  const serviceAccountId = ctx.$config?.api?.submissionsServiceAccount?.id;
  const serviceAccountUser = await getUserById(serviceAccountId);
  if (!serviceAccountUser) {
    console.error('service account user not found');
    throw httpError(500, 'service account user not found');
  }
  ctx.user = { email_verified: true, ...serviceAccountUser };

  const site = await sites.get(ctx, 'pmc');
  if (!site) {
    console.error('site `pmc` not found');
    throw error404();
  }

  await enqueueAndDispatchJob({
    job_id: uuidv7(),
    job_type: 'PMC_WORKFLOW_SYNC',
    payload: {
      site_id: site.id,
      triggered_by_user_id: serviceAccountId,
      triggered_by_user_name: 'PMC workflow sync (automated)',
    },
    invoked_by_id: serviceAccountId,
  });

  return { ok: true };
};

export function action() {
  throw error405();
}
