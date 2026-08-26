import type { ActionFunctionArgs } from 'react-router';
import { error405, httpError } from '@curvenote/scms-core';
import { getPrismaClient } from '@curvenote/scms-server';
import { isTextIntegritySlackWebhookEvent } from '@hhmi/checks-notify';
import type { TextIntegrityDataSchema } from '../../schema.js';
import {
  MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
  parseNotifyWebhookJson,
  textIntegrityDataSchema,
} from '../../schema.js';
import { shouldEnqueuePersistPdfNotify } from '../../server/notify-persist-enqueue.server.js';
import { applyWebhookEvent } from '../../server/stateMachine.server.js';
import { enqueueTextIntegrityPersistPdfJob } from '../../server/enqueue-persist-pdf.server.js';
import { patchTextIntegrityRunServiceData } from '../../server/checkRunColumns.server.js';
import {
  notifyTextIntegrityWebhookHandlerError,
  notifyTextIntegrityWebhookMilestone,
} from '../../server/slackNotify.server.js';
import { trackTextIntegrityTerminalTransition } from '../../server/analytics.server.js';

export function loader() {
  throw error405();
}

export async function action(args: ActionFunctionArgs) {
  const id = args.params.id;
  if (!id) {
    throw httpError(400, 'Missing check service run id');
  }

  let rawBody = '';
  try {
    rawBody = await args.request.text();
  } catch {
    return Response.json({ ok: false, error: 'Unable to read request body' }, { status: 400 });
  }

  let json: unknown;
  try {
    json = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = parseNotifyWebhookJson(json);
  if (parsed.ok === false) {
    void notifyTextIntegrityWebhookHandlerError(id, 'invalid_payload', {
      issues: parsed.issues.map((i) => i.message).join('; '),
    });
    return Response.json(
      { ok: false, error: 'Unknown webhook event or payload', issues: parsed.issues },
      { status: 400 },
    );
  }

  if ('noop' in parsed) {
    return Response.json({ ok: true }, { status: 200 });
  }

  const webhook = parsed.webhook;
  const receivedAt = new Date().toISOString();

  const prisma = await getPrismaClient();
  const existingRun = await prisma.checkServiceRun.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      work_version_id: true,
      created_by_id: true,
      attempt: true,
      retry_of_id: true,
      date_created: true,
      data: true,
    },
  });
  if (!existingRun) {
    return Response.json({ ok: false, error: 'Check run not found' }, { status: 404 });
  }

  const beforeParsed = textIntegrityDataSchema.safeParse(
    (existingRun.data as { serviceData?: unknown } | null)?.serviceData,
  );
  const serviceDataBefore = beforeParsed.success
    ? beforeParsed.data
    : MINIMAL_TEXT_INTEGRITY_SERVICE_DATA;

  let serviceDataAfterWebhook: TextIntegrityDataSchema | undefined;
  let priorEvent: string | undefined;

  try {
    await patchTextIntegrityRunServiceData(
      id,
      (currentServiceData) => {
        const sd = textIntegrityDataSchema.safeParse(currentServiceData);
        const base = sd.success ? sd.data : MINIMAL_TEXT_INTEGRITY_SERVICE_DATA;
        priorEvent = base.latest?.event;
        const nextServiceData = applyWebhookEvent(base, webhook, receivedAt);
        serviceDataAfterWebhook = nextServiceData ?? base;
        if (!nextServiceData) {
          return null;
        }
        return nextServiceData;
      },
      receivedAt,
    );
  } catch (err) {
    console.error('[text-integrity notify]', err);
    void notifyTextIntegrityWebhookHandlerError(id, 'persist_failed', {
      error: err instanceof Error ? err.message : 'Failed to update run',
    });
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to update run' },
      { status: 500 },
    );
  }

  if (serviceDataAfterWebhook && isTextIntegritySlackWebhookEvent(webhook.event)) {
    void notifyTextIntegrityWebhookMilestone(
      id,
      webhook.event,
      webhook.metadata,
      priorEvent,
      serviceDataAfterWebhook,
      { request: args.request },
    );
  }

  if (serviceDataAfterWebhook && shouldEnqueuePersistPdfNotify(webhook, serviceDataAfterWebhook)) {
    const run = await prisma.checkServiceRun.findUnique({
      where: { id },
      select: { work_version_id: true, created_by_id: true },
    });
    if (run?.work_version_id) {
      await enqueueTextIntegrityPersistPdfJob(
        run.work_version_id,
        id,
        run.created_by_id ?? undefined,
      );
    }
  }

  void trackTextIntegrityTerminalTransition(
    existingRun,
    serviceDataBefore,
    serviceDataAfterWebhook,
    undefined,
    args.request,
  );

  return Response.json({ ok: true }, { status: 200 });
}
