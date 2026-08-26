import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { error405 } from '@curvenote/scms-core';
import { getConfig, verifyEndpointScopedHandshake } from '@curvenote/scms-server';
import {
  runTextIntegrityRetrySweep,
  TEXT_INTEGRITY_RETRY_SWEEP_SCOPE,
} from '../../server/retrySweep.server.js';
import { notifyTextIntegritySweepHandlerError } from '../../server/slackNotify.server.js';

export const config = {
  maxDuration: 300,
};

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

function logLocalRetrySweepEvent(message: string, metadata?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(message, metadata);
  }
}

/**
 * POST /v1/hooks/text-integrity/retry-sweep
 *
 * Cron callback: retries eligible failed Text Integrity runs using the domain retry flow.
 * Auth: endpoint-scoped handshake (`TEXT_INTEGRITY_RETRY_SWEEP_SCOPE`).
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
      TEXT_INTEGRITY_RETRY_SWEEP_SCOPE,
    );
  } catch {
    return unauthorized();
  }

  logLocalRetrySweepEvent('[text-integrity retry-sweep] accepted');

  try {
    const result = await runTextIntegrityRetrySweep();
    logLocalRetrySweepEvent('[text-integrity retry-sweep] done', result);
    return Response.json({ status: 'ok', ...result }, { status: 200 });
  } catch (error) {
    console.error('[text-integrity retry-sweep] failed', error);
    const message = error instanceof Error ? error.message : 'Retry sweep failed';
    void notifyTextIntegritySweepHandlerError(message);
    return Response.json({ status: 'error', message: 'Retry sweep failed' }, { status: 500 });
  }
}
