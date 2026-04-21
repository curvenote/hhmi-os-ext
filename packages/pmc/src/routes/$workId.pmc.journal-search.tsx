import type { LoaderFunctionArgs } from 'react-router';
import { redirect, data } from 'react-router';
import { withSecureWorkContext } from '@curvenote/scms-server';
import { work } from '@curvenote/scms-core';
import { searchNIHJournals } from '../backend/services/nih-journal.server.js';

export async function loader(args: LoaderFunctionArgs) {
  const ctx = await withSecureWorkContext(args, [work.id.submissions.read]);

  // Check if PMC extension is enabled in config
  if (!ctx.$config.app.extensions?.pmc) {
    return redirect('/app/works');
  }

  const url = new URL(args.request.url);
  const query = url.searchParams.get('q');
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

  // Validate query parameter
  if (!query || query.trim().length === 0) {
    return { journals: [] };
  }

  // Validate limit parameter
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return data(
      { error: { type: 'general', message: 'Invalid limit parameter' } },
      { status: 400 },
    );
  }

  try {
    // Search NIH journals
    const journals = await searchNIHJournals(query.trim(), limit);
    return { journals }; // no Response.json as this is consumed by a fetcher
  } catch (error) {
    console.error('Journal search error:', error);
    return data(
      { error: { type: 'general', message: 'Failed to search journals' } },
      { status: 500 },
    );
  }
}
