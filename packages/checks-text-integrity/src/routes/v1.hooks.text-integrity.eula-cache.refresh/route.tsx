import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { error405 } from '@curvenote/scms-core';
import { getConfig, verifyEndpointScopedHandshake, withContext } from '@curvenote/scms-server';
import { TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCOPE } from '../../server/eulaCacheCron.server.js';
import { runEulaCacheCronRefresh } from '../../server/eula.server.js';

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * POST /v1/hooks/text-integrity/eula-cache/refresh
 *
 * Cron callback: refresh cached Turnitin EULA (relay getTerms + page mode).
 * Auth: endpoint-scoped handshake (`TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCOPE`).
 */
export async function loader(args: LoaderFunctionArgs) {
  if (args.request.method !== 'GET') {
    throw error405();
  }
  return unauthorized();
}

export async function action(args: ActionFunctionArgs) {
  if (args.request.method !== 'POST') {
    throw error405();
  }

  const appConfig = await getConfig();
  try {
    verifyEndpointScopedHandshake(
      args.request.headers.get('Authorization'),
      appConfig,
      TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCOPE,
    );
  } catch {
    return unauthorized();
  }

  const ctx = await withContext(args, { noTokens: true });
  const result = await runEulaCacheCronRefresh(ctx);
  return Response.json({ ok: true, ...result }, { status: 200 });
}
