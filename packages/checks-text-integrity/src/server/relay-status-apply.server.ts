import type { RelayNotifyEnvelope } from '@curvenote/check-relay-types';
import { getPrismaClient } from '@curvenote/scms-server';
import {
  MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
  parseNotifyWebhookJson,
  textIntegrityDataSchema,
} from '../schema.js';
import type { TextIntegrityDataSchema } from '../schema.js';
import { trackTextIntegrityTerminalTransition } from './analytics.server.js';
import { applyWebhookEvent } from './stateMachine.server.js';
import { patchTextIntegrityRunServiceData } from './checkRunColumns.server.js';

function readServiceDataFromRun(data: unknown): TextIntegrityDataSchema {
  const raw =
    data != null && typeof data === 'object'
      ? (data as { serviceData?: unknown }).serviceData
      : undefined;
  const parsed = textIntegrityDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : MINIMAL_TEXT_INTEGRITY_SERVICE_DATA;
}

export type ApplyRelayCheckStatusEnvelopesOptions = {
  request?: Request;
};

/**
 * Apply relay check-status notify envelopes (same shapes as ingest `notify_url`) to a run.
 */
export async function applyRelayCheckStatusEnvelopes(
  checkServiceRunId: string,
  envelopes: readonly RelayNotifyEnvelope[],
  options?: ApplyRelayCheckStatusEnvelopesOptions,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (envelopes.length === 0) {
    return { ok: true };
  }

  const prisma = await getPrismaClient();
  const existingRun = await prisma.checkServiceRun.findUnique({
    where: { id: checkServiceRunId },
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
    return { ok: false, message: 'Check run not found' };
  }

  const serviceDataBefore = readServiceDataFromRun(existingRun.data);
  let serviceDataAfter = serviceDataBefore;
  let appliedEnvelope = false;

  try {
    for (const envelope of envelopes) {
      const parsed = parseNotifyWebhookJson(envelope);
      if (parsed.ok === false) {
        return { ok: false, message: parsed.issues.map((i) => i.message).join('; ') };
      }
      if ('noop' in parsed) {
        continue;
      }
      const webhook = parsed.webhook;
      const receivedAt = new Date().toISOString();

      try {
        await patchTextIntegrityRunServiceData(
          checkServiceRunId,
          (currentServiceData: TextIntegrityDataSchema) => {
            const nextServiceData = applyWebhookEvent(currentServiceData, webhook, receivedAt);
            if (!nextServiceData) {
              return currentServiceData;
            }
            serviceDataAfter = nextServiceData;
            appliedEnvelope = true;
            return nextServiceData;
          },
          receivedAt,
        );
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Failed to apply relay status envelope',
        };
      }
    }

    return { ok: true };
  } finally {
    if (appliedEnvelope) {
      void trackTextIntegrityTerminalTransition(
        existingRun,
        serviceDataBefore,
        serviceDataAfter,
        undefined,
        options?.request,
      );
    }
  }
}
