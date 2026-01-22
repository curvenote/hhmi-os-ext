import type { LoaderFunction } from 'react-router';
import { data } from 'react-router';
import { withContext } from '@curvenote/scms-server';
import { error404, error405 } from '@curvenote/scms-core';
import { fetchAllScientists } from '../backend/airtable.scientists.server.js';
import {
  fetchEverythingCoveredByPolicy,
  fetchEverythingNotCoveredByPolicy,
} from '../backend/airtable.server.js';

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
    console.error('Invalid authorization header for force-airtable-cache webhook');
    return data({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Step 1: Fetch all scientists and wait for completion
    const scientists = await fetchAllScientists();

    // Step 2: Find the first scientist with a valid ORCID
    const scientistWithOrcid = scientists.find((s) => s.orcid && s.orcid.trim() !== '');

    if (!scientistWithOrcid) {
      return data(
        { error: 'Error warming Airtable cache: No scientists with valid ORCID found' },
        { status: 422 },
      );
    }

    const orcid = scientistWithOrcid.orcid;

    await Promise.all([
        fetchEverythingCoveredByPolicy(orcid),
        fetchEverythingNotCoveredByPolicy(orcid),
      ]);

    return data({ ok: true });
  } catch (error) {
    console.error('Error warming Airtable cache:', error);
    return data(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 422 },
    );
  }
};

export function action() {
  throw error405();
}
