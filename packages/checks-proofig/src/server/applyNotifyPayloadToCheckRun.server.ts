import type { ZodIssue } from 'zod';
import { isProofigSlackMilestoneState } from '@hhmi/checks-notify';
import { getPrismaClient } from '@curvenote/scms-server';
import { MINIMAL_PROOFIG_SERVICE_DATA, ProofigNotifyPayloadSchema } from '../schema.js';
import { updateStagesAndServiceDataFromValidatedNotifyPayload } from './stateMachine.server.js';
import { patchProofigRunServiceData } from './checkRunColumns.server.js';
import { notifyProofigWebhookMilestone, readProofigLatestState } from './slackNotify.server.js';
import { enqueueProofigPersistPdfIfNeeded } from './enqueue-proofig-persist-pdf.server.js';

export type ApplyNotifyResult =
  | { ok: true }
  | { ok: false; kind: 'parse'; issues: ZodIssue[] }
  | { ok: false; kind: 'persist'; message: string };

/**
 * Applies a Proofig notify-shaped JSON body to a check service run (same persistence as the notify webhook).
 */
export async function applyNotifyPayloadToCheckRun(
  checkServiceRunId: string,
  json: unknown,
  receivedAt: string,
): Promise<ApplyNotifyResult> {
  const parsed = ProofigNotifyPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, kind: 'parse', issues: parsed.error.issues };
  }

  try {
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
    const priorState = readProofigLatestState(existingRun?.data);

    await patchProofigRunServiceData(
      checkServiceRunId,
      (existingServiceData) => {
        const nextServiceData = updateStagesAndServiceDataFromValidatedNotifyPayload(
          existingServiceData ?? MINIMAL_PROOFIG_SERVICE_DATA,
          parsed.data,
          receivedAt,
        );
        return nextServiceData ?? null;
      },
      receivedAt,
      5,
      { trackTerminalAnalytics: true },
    );

    if (isProofigSlackMilestoneState(parsed.data.state)) {
      void notifyProofigWebhookMilestone(
        checkServiceRunId,
        parsed.data.state,
        parsed.data,
        priorState,
      );
    }
  } catch (err) {
    return {
      ok: false,
      kind: 'persist',
      message: err instanceof Error ? err.message : 'Failed to persist payload',
    };
  }

  // Best-effort: when the run has reached a final report outcome, auto-generate the report PDF.
  // Never fail the notify apply because of PDF dispatch problems.
  try {
    await enqueueProofigPersistPdfIfNeeded(checkServiceRunId);
  } catch (err) {
    console.error('[proofig] failed to enqueue report PDF persist', err);
  }

  return { ok: true };
}
