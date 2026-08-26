import { SlackEventType } from '@curvenote/scms-server';
import {
  buildCheckRunMetadata,
  loadCheckRunContext,
  sendCheckSlack,
  sendCheckSlackFromConfig,
  shouldNotifyErrorTransition,
  textIntegrityWebhookColor,
  textIntegrityWebhookMessage,
  type CheckSlackUrlOptions,
} from '@hhmi/checks-notify';
import { getErrorMessage, type TextIntegrityDataSchema } from '../serviceDataSchemas.js';
import {
  resolveTextIntegrityCoarseStatus,
  type CheckRunCoarseStatus,
} from './checkRunColumns.server.js';

function firstTextIntegrityErrorDetails(serviceData: TextIntegrityDataSchema | undefined): {
  stage?: string;
  errorMessage?: string;
  errorCode?: string;
} {
  if (!serviceData?.stages) {
    return {
      errorMessage: serviceData?.latest?.errorMessage,
      errorCode: serviceData?.latest?.errorCode,
    };
  }
  if (serviceData.stages.submission.status === 'error') {
    return {
      stage: 'submission',
      errorMessage: serviceData.stages.submission.error ?? serviceData.latest?.errorMessage,
      errorCode: serviceData.stages.submission.errorCode ?? serviceData.latest?.errorCode,
    };
  }
  if (serviceData.stages.processing?.status === 'error') {
    return {
      stage: 'processing',
      errorMessage: serviceData.stages.processing.error ?? serviceData.latest?.errorMessage,
      errorCode: serviceData.stages.processing.errorCode ?? serviceData.latest?.errorCode,
    };
  }
  if (serviceData.stages.reportGeneration?.status === 'error') {
    return {
      stage: 'reportGeneration',
      errorMessage: serviceData.stages.reportGeneration.error ?? serviceData.latest?.errorMessage,
      errorCode: serviceData.stages.reportGeneration.errorCode ?? serviceData.latest?.errorCode,
    };
  }
  const msg = getErrorMessage(serviceData);
  return {
    errorMessage: msg ?? serviceData.latest?.errorMessage,
    errorCode: serviceData.latest?.errorCode,
  };
}

export async function notifyTextIntegrityErrorTransition(
  checkRunId: string,
  beforeStatus: CheckRunCoarseStatus | null | undefined,
  serviceData: TextIntegrityDataSchema | undefined,
  source?: {
    sendSlackNotification: (message: Parameters<typeof sendCheckSlack>[1]) => Promise<void>;
  },
  urlOptions?: CheckSlackUrlOptions,
): Promise<void> {
  const afterStatus = resolveTextIntegrityCoarseStatus(serviceData);
  if (!shouldNotifyErrorTransition(beforeStatus, afterStatus)) return;

  const runContext = await loadCheckRunContext(checkRunId);
  if (!runContext) return;

  const { stage, errorMessage, errorCode } = firstTextIntegrityErrorDetails(serviceData);
  const payload = {
    eventType: SlackEventType.CHECK_RUN_ERROR,
    message: errorMessage ?? 'Text integrity check run entered error state',
    color: 'danger' as const,
    user: runContext.createdById ? { id: runContext.createdById } : undefined,
    metadata: buildCheckRunMetadata(
      runContext,
      {
        stage,
        errorMessage,
        ...(errorCode ? { errorCode } : {}),
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

export async function notifyTextIntegrityStarted(
  source: {
    sendSlackNotification: (message: Parameters<typeof sendCheckSlack>[1]) => Promise<void>;
  },
  checkRunId: string,
  workVersionId: string,
  extra: { failedInline?: boolean } = {},
): Promise<void> {
  const runContext = await loadCheckRunContext(checkRunId);
  const base = runContext ?? {
    checkRunId,
    checkKind: 'checks-text-integrity',
    workVersionId,
  };

  await sendCheckSlack(source, {
    eventType: SlackEventType.CHECK_RUN_STARTED,
    message: extra.failedInline
      ? 'Text integrity check failed before submission'
      : 'Text integrity check started',
    color: extra.failedInline ? 'danger' : 'good',
    user: base.createdById ? { id: base.createdById } : undefined,
    metadata: buildCheckRunMetadata(base, {
      ...(extra.failedInline ? { failedInline: true } : {}),
    }),
  });
}

export async function notifyTextIntegritySweepHandlerError(message: string): Promise<void> {
  await sendCheckSlackFromConfig({
    eventType: SlackEventType.CHECK_RUN_ERROR,
    message: `Text integrity retry sweep failed: ${message}`,
    color: 'danger',
    metadata: { checkKind: 'checks-text-integrity', origin: 'cron-sweep' },
  });
}

export async function notifyTextIntegrityWebhookMilestone(
  checkRunId: string,
  event: string,
  metadata: Record<string, unknown> | undefined,
  priorEvent: string | undefined,
  serviceData: TextIntegrityDataSchema | undefined,
  urlOptions?: CheckSlackUrlOptions,
): Promise<void> {
  if (event === priorEvent) return;

  const runContext = await loadCheckRunContext(checkRunId);
  if (!runContext) return;

  const errorCode =
    typeof metadata?.error_code === 'string' ? metadata.error_code : serviceData?.latest?.errorCode;
  const errorMessage =
    typeof metadata?.error_message === 'string'
      ? metadata.error_message
      : serviceData?.latest?.errorMessage;

  await sendCheckSlackFromConfig({
    eventType: SlackEventType.CHECK_RUN_MILESTONE,
    message: textIntegrityWebhookMessage(
      event,
      serviceData?.summaryReport?.overallMatchPercentage ??
        serviceData?.latest?.overallMatchPercentage,
    ),
    color: textIntegrityWebhookColor(event),
    user: runContext.createdById ? { id: runContext.createdById } : undefined,
    metadata: buildCheckRunMetadata(
      runContext,
      {
        event,
        ...(metadata?.provider_event ? { providerEvent: metadata.provider_event } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(errorMessage ? { errorMessage } : {}),
        ...(serviceData?.summaryReport?.overallMatchPercentage != null
          ? { overallMatchPercentage: serviceData.summaryReport.overallMatchPercentage }
          : {}),
      },
      urlOptions,
    ),
  });
}

export async function notifyTextIntegrityPdfPersistFailed(
  source: {
    sendSlackNotification: (message: Parameters<typeof sendCheckSlack>[1]) => Promise<void>;
  },
  checkRunId: string,
  message: string,
): Promise<void> {
  const runContext = await loadCheckRunContext(checkRunId);
  if (!runContext) return;

  await sendCheckSlack(source, {
    eventType: SlackEventType.CHECK_RUN_ERROR,
    message: `Similarity PDF persist failed: ${message}`,
    color: 'danger',
    user: runContext.createdById ? { id: runContext.createdById } : undefined,
    metadata: buildCheckRunMetadata(runContext, {
      stage: 'reportGeneration',
      errorMessage: message,
    }),
  });
}

export async function notifyTextIntegrityEulaAccepted(
  source: {
    sendSlackNotification: (message: Parameters<typeof sendCheckSlack>[1]) => Promise<void>;
  },
  user: { id?: string; email?: string | null },
  acceptance: { version: string; language: string; acceptedAt: string },
): Promise<void> {
  await sendCheckSlack(source, {
    eventType: SlackEventType.CHECK_EULA_ACCEPTED,
    message: `User accepted Turnitin EULA (${acceptance.version})`,
    color: 'good',
    user,
    metadata: {
      checkKind: 'checks-text-integrity',
      version: acceptance.version,
      language: acceptance.language,
      acceptedAt: acceptance.acceptedAt,
    },
  });
}

export async function notifyTextIntegrityActionError(
  source: {
    sendSlackNotification: (message: Parameters<typeof sendCheckSlack>[1]) => Promise<void>;
  },
  checkRunId: string | undefined,
  action: string,
  message: string,
): Promise<void> {
  const runContext = checkRunId ? await loadCheckRunContext(checkRunId) : null;
  await sendCheckSlack(source, {
    eventType: SlackEventType.CHECK_RUN_ERROR,
    message: `Text integrity ${action} failed: ${message}`,
    color: 'danger',
    metadata: runContext
      ? buildCheckRunMetadata(runContext, { action, errorMessage: message })
      : { checkKind: 'checks-text-integrity', action, errorMessage: message, checkRunId },
  });
}

export async function notifyTextIntegrityWebhookHandlerError(
  checkRunId: string | undefined,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const runContext = checkRunId ? await loadCheckRunContext(checkRunId) : null;
  await sendCheckSlackFromConfig({
    eventType: SlackEventType.CHECK_RUN_ERROR,
    message: `Text integrity webhook error: ${reason}`,
    color: 'danger',
    metadata: runContext
      ? buildCheckRunMetadata(runContext, { reason, ...extra })
      : { checkKind: 'checks-text-integrity', reason, checkRunId, ...extra },
  });
}
