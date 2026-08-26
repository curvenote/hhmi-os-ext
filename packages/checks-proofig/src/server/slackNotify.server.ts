import { SlackEventType } from '@curvenote/scms-server';
import {
  buildCheckRunMetadata,
  loadCheckRunContext,
  proofigMilestoneColor,
  proofigMilestoneMessage,
  sendCheckSlack,
  sendCheckSlackFromConfig,
  shouldNotifyErrorTransition,
  type CheckSlackUrlOptions,
} from '@hhmi/checks-notify';
import { hasError, proofigDataSchema, type ProofigDataSchema } from '../schema.js';
import { resolveProofigCoarseStatus, type CheckRunCoarseStatus } from './checkRunColumns.server.js';

function firstProofigStageError(serviceData: ProofigDataSchema | undefined): {
  stage?: string;
  errorMessage?: string;
} {
  if (!serviceData?.stages) return {};
  for (const [stage, data] of Object.entries(serviceData.stages)) {
    if (data?.status === 'error' && data.error?.trim()) {
      return { stage, errorMessage: data.error.trim() };
    }
  }
  if (hasError(serviceData)) {
    return { errorMessage: 'Proofig check run failed' };
  }
  return {};
}

export async function notifyProofigErrorTransition(
  checkRunId: string,
  beforeStatus: CheckRunCoarseStatus | null | undefined,
  serviceData: ProofigDataSchema | undefined,
  source?: {
    sendSlackNotification: (message: Parameters<typeof sendCheckSlack>[1]) => Promise<void>;
  },
  urlOptions?: CheckSlackUrlOptions,
): Promise<void> {
  const afterStatus = resolveProofigCoarseStatus(serviceData);
  if (!shouldNotifyErrorTransition(beforeStatus, afterStatus)) return;

  const runContext = await loadCheckRunContext(checkRunId);
  if (!runContext) return;

  const { stage, errorMessage } = firstProofigStageError(serviceData);
  const payload = {
    eventType: SlackEventType.CHECK_RUN_ERROR,
    message: errorMessage ?? 'Proofig check run entered error state',
    color: 'danger' as const,
    user: runContext.createdById ? { id: runContext.createdById } : undefined,
    metadata: buildCheckRunMetadata(
      runContext,
      {
        stage,
        errorMessage,
      },
      urlOptions,
    ),
  };

  if (source) {
    await sendCheckSlack(source, payload);
  } else {
    await sendCheckSlackFromConfig(payload);
  }
}

export async function notifyProofigStarted(
  source: {
    sendSlackNotification: (message: Parameters<typeof sendCheckSlack>[1]) => Promise<void>;
  },
  checkRunId: string,
  workVersionId: string,
  extra: { sourceFormat?: 'pdf' | 'docx'; failedInline?: boolean } = {},
): Promise<void> {
  const runContext = await loadCheckRunContext(checkRunId);
  const base = runContext ?? {
    checkRunId,
    checkKind: 'proofig',
    workVersionId,
  };

  await sendCheckSlack(source, {
    eventType: SlackEventType.CHECK_RUN_STARTED,
    message: extra.failedInline
      ? 'Proofig check failed before submission'
      : 'Proofig check started',
    color: extra.failedInline ? 'danger' : 'good',
    user: base.createdById ? { id: base.createdById } : undefined,
    metadata: buildCheckRunMetadata(base, {
      ...(extra.sourceFormat ? { sourceFormat: extra.sourceFormat } : {}),
      ...(extra.failedInline ? { failedInline: true } : {}),
    }),
  });
}

export async function notifyProofigWebhookMilestone(
  checkRunId: string,
  state: string,
  payload: { report_id?: string; matches_report?: number; message?: string },
  priorState: string | undefined,
  urlOptions?: CheckSlackUrlOptions,
): Promise<void> {
  if (state === priorState) return;

  const runContext = await loadCheckRunContext(checkRunId);
  if (!runContext) return;

  await sendCheckSlackFromConfig({
    eventType: SlackEventType.CHECK_RUN_MILESTONE,
    message: proofigMilestoneMessage(state, payload.report_id),
    color: proofigMilestoneColor(state),
    user: runContext.createdById ? { id: runContext.createdById } : undefined,
    metadata: buildCheckRunMetadata(
      runContext,
      {
        state,
        reportId: payload.report_id,
        ...(payload.matches_report != null ? { matchesReport: payload.matches_report } : {}),
        ...(payload.message?.trim() ? { providerMessage: payload.message.trim() } : {}),
      },
      urlOptions,
    ),
  });
}

export async function notifyProofigWebhookHandlerError(
  checkRunId: string | undefined,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const runContext = checkRunId ? await loadCheckRunContext(checkRunId) : null;
  await sendCheckSlackFromConfig({
    eventType: SlackEventType.CHECK_RUN_ERROR,
    message: `Proofig webhook error: ${reason}`,
    color: 'danger',
    metadata: runContext
      ? buildCheckRunMetadata(runContext, { reason, ...extra })
      : { checkKind: 'proofig', reason, checkRunId, ...extra },
  });
}

export function readProofigLatestState(runData: unknown): string | undefined {
  if (runData == null || typeof runData !== 'object') return undefined;
  const raw = (runData as Record<string, unknown>).serviceData;
  const parsed = proofigDataSchema.safeParse(raw);
  return parsed.success ? parsed.data.summary?.state : undefined;
}
