import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { error405, httpError } from '@curvenote/scms-core';
import { createMessageRecord, updateMessageStatus } from '@curvenote/scms-server';
import { ProofigNotifyPayloadSchema } from '../../schema.js';
import { applyNotifyPayloadToCheckRun } from '../../server/applyNotifyPayloadToCheckRun.server.js';
import { proofigCheckRunAlreadyMarkedDeleted } from '../../server/proofigNotifyWebhookGuards.server.js';
import { notifyProofigWebhookHandlerError } from '../../server/slackNotify.server.js';
import {
  PROOFIG_NOTIFY_PAYLOAD_JSON_SCHEMA,
  PROOFIG_NOTIFY_RESULTS_JSON_SCHEMA,
} from './message-schema.server.js';

const NOTIFY_LOG = '[proofig:notify]';

function logNotify(requestId: string, phase: string, data: Record<string, unknown> = {}): void {
  console.info(NOTIFY_LOG, phase, JSON.stringify({ requestId, ...data }));
}

/** Loader runs for document/GET-style hits; keeps the route non-open (405, no data). */
export function loader(args: LoaderFunctionArgs) {
  const id = args.params.id ?? null;
  const requestId = crypto.randomUUID();
  logNotify(requestId, 'endpoint_hit_loader', {
    method: args.request.method,
    url: args.request.url,
    checkServiceRunId: id,
    note: 'notify URL only accepts POST via action; returning 405',
  });
  throw error405();
}

export async function action(args: ActionFunctionArgs) {
  const requestId = crypto.randomUUID();
  const id = args.params.id;
  if (!id) {
    logNotify(requestId, 'handler_return', {
      outcome: 'error',
      status: 400,
      reason: 'missing_check_service_run_id',
    });
    throw httpError(400, 'Missing check service run id');
  }

  logNotify(requestId, 'endpoint_hit_action', {
    method: args.request.method,
    url: args.request.url,
    checkServiceRunId: id,
  });

  if (await proofigCheckRunAlreadyMarkedDeleted(id)) {
    try {
      await args.request.text();
    } catch (err) {
      logNotify(requestId, 'handler_return', {
        outcome: 'error',
        status: 400,
        reason: 'unable_to_read_body',
        checkServiceRunId: id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw httpError(400, 'Unable to read request body', {
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    logNotify(requestId, 'handler_return', {
      outcome: 'ignored_already_deleted',
      status: 200,
      checkServiceRunId: id,
      note: 'Check run already had Proofig deleted; no message or state update',
    });
    return new Response(null, { status: 200 });
  }

  const receivedAt = new Date().toISOString();

  // Read the request body once; we always create a pending message record for every webhook.
  let rawBody = '';
  try {
    rawBody = await args.request.text();
  } catch (err) {
    logNotify(requestId, 'handler_return', {
      outcome: 'error',
      status: 400,
      reason: 'unable_to_read_body',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    throw httpError(400, 'Unable to read request body', {
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  logNotify(requestId, 'payload_received', {
    checkServiceRunId: id,
    rawBodyLength: rawBody.length,
  });

  let json: unknown;
  let jsonParseError: string | undefined;
  try {
    json = rawBody ? JSON.parse(rawBody) : null;
  } catch (e) {
    json = null;
    jsonParseError = e instanceof Error ? e.message : 'Unknown parse error';
  }

  logNotify(requestId, 'json_payload', {
    checkServiceRunId: id,
    json,
    jsonParseError: jsonParseError ?? null,
  });

  const messageId = await createMessageRecord({
    module: '@hhmi/checks-proofig',
    type: 'proofingNotify',
    status: 'PENDING',
    payload: (json ?? { rawBody }) as any,
    payloadSchema: PROOFIG_NOTIFY_PAYLOAD_JSON_SCHEMA,
    results: { checkServiceRunId: id, receivedAt } as any,
    resultsSchema: PROOFIG_NOTIFY_RESULTS_JSON_SCHEMA,
  });

  const parsed = ProofigNotifyPayloadSchema.safeParse(json);
  if (!parsed.success) {
    await updateMessageStatus(messageId, 'ERROR', {
      processedAt: new Date().toISOString(),
      issues: parsed.error.issues,
    } as any);
    void notifyProofigWebhookHandlerError(id, 'invalid_payload', {
      messageId,
      issues: parsed.error.issues.map((i) => i.message).join('; '),
    });
    logNotify(requestId, 'handler_return', {
      outcome: 'invalid_payload',
      status: 400,
      messageId,
      checkServiceRunId: id,
      issues: parsed.error.issues,
    });
    return Response.json(
      { ok: false, error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const applyResult = await applyNotifyPayloadToCheckRun(id, parsed.data, receivedAt);
  if (!applyResult.ok) {
    const errMessage =
      applyResult.kind === 'persist'
        ? applyResult.message
        : applyResult.issues.map((i) => i.message).join('; ');
    await updateMessageStatus(messageId, 'ERROR', {
      processedAt: new Date().toISOString(),
      error: errMessage,
    } as any);
    void notifyProofigWebhookHandlerError(id, 'persist_failed', {
      messageId,
      error: errMessage,
    });
    logNotify(requestId, 'handler_return', {
      outcome: 'persist_failed',
      status: 400,
      messageId,
      checkServiceRunId: id,
      error: errMessage,
    });
    // Keep behavior simple per requirement: 200 if expected, otherwise 400.
    return Response.json(
      {
        ok: false,
        error: 'Failed to persist webhook payload',
        message: errMessage,
      },
      { status: 400 },
    );
  }

  await updateMessageStatus(messageId, 'ACCEPTED', {
    processedAt: new Date().toISOString(),
  } as any);

  logNotify(requestId, 'handler_return', {
    outcome: 'accepted',
    status: 200,
    messageId,
    checkServiceRunId: id,
    note: 'empty body per spec',
  });

  // Per spec, return a 200 with no required response body.
  return new Response(null, { status: 200 });
}
