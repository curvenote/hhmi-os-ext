import type { LoaderFunction } from 'react-router';
import { data } from 'react-router';
import { withContext, jobs, sites } from '@curvenote/scms-server';
import { error404, error405 } from '@curvenote/scms-core';
import { uuidv7 } from 'uuidv7';
import { getJobs } from '../server.js';

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

  const site = await sites.get(ctx, 'pmc');
  if (!site) {
    console.error('site `pmc` not found');
    throw error404();
  }

  // Create a new PMC_WORKFLOW_SYNC job for this site
  await jobs.invoke(
    ctx,
    {
      id: uuidv7(),
      job_type: 'PMC_WORKFLOW_SYNC',
      payload: { site_id: site.id },
    },
    getJobs(),
  );

  return { ok: true };
};

export function action() {
  throw error405();
}
