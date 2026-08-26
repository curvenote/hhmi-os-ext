import { ImageIntegrityTrackEvent } from '../analytics.catalog.js';
import {
  buildChecksRunStartFailedProps,
  buildChecksRunStartedProps,
  sanitizeAnalyticsErrorMessage,
} from '@hhmi/checks-shared/analytics/properties';
import {
  loadChecksRunAnalyticsContext,
  runLifecyclePropsFromRow,
} from '@hhmi/checks-shared/analytics/runContext.server';
import { trackChecksEvent, trackChecksEventForUser } from '@hhmi/checks-shared/analytics/server';
import type { TrackChecksContext } from '@hhmi/checks-shared/analytics/server';
import type { ChecksAnalyticsTrigger } from '@hhmi/checks-shared/analytics/properties';
import { KnownState, STAGE_ORDER, hasError, type ProofigDataSchema } from '../schema.js';

type ProofigTerminalOutcome = 'completed' | 'failed';

const PROOFIG_COMPLETED_SUMMARY_STATES = new Set<string>([
  KnownState.ReportClean,
  KnownState.ReportFlagged,
]);

function resolveProofigFailureReason(serviceData: ProofigDataSchema): string | undefined {
  if (serviceData.deleted || serviceData.summary?.state === KnownState.Deleted) {
    return sanitizeAnalyticsErrorMessage('Proofig run deleted at provider');
  }
  for (const stageKey of STAGE_ORDER) {
    const stage = serviceData.stages?.[stageKey];
    if (stage?.status === 'error' && stage.error?.trim()) {
      return sanitizeAnalyticsErrorMessage(stage.error.trim());
    }
  }
  if (serviceData.summary?.state?.trim()) {
    return sanitizeAnalyticsErrorMessage(`Proofig state: ${serviceData.summary.state}`);
  }
  return sanitizeAnalyticsErrorMessage('Proofig check failed');
}

/** Analytics terminal state — includes notify outcomes and local stage/column errors. */
export function resolveProofigTerminalOutcomeFromServiceData(
  serviceData: ProofigDataSchema | undefined,
): ProofigTerminalOutcome | null {
  if (!serviceData) return null;
  if (serviceData.deleted || serviceData.summary?.state === KnownState.Deleted) return 'failed';
  if (hasError(serviceData)) return 'failed';
  const summaryState = serviceData.summary?.state;
  if (summaryState && PROOFIG_COMPLETED_SUMMARY_STATES.has(summaryState)) return 'completed';
  return null;
}

function wasProofigTerminal(serviceData: ProofigDataSchema | undefined): boolean {
  return resolveProofigTerminalOutcomeFromServiceData(serviceData) != null;
}

export async function trackProofigRunStarted(
  ctx: TrackChecksContext,
  workVersionId: string,
  checkRunId: string,
  options: {
    attempt?: number;
    retryOfRunId?: string;
    trigger?: ChecksAnalyticsTrigger | string | null;
    sourceFormat?: 'pdf' | 'docx';
    invokedByUserId?: string;
  },
): Promise<void> {
  try {
    const props = await loadChecksRunAnalyticsContext(workVersionId, 'proofig', {
      checkRunId,
      attempt: options.attempt,
      retryOfRunId: options.retryOfRunId,
      trigger: options.trigger,
      createdByUserId: ctx.user?.id,
      invokedByUserId: options.invokedByUserId ?? ctx.user?.id,
    });
    if (options.sourceFormat) {
      props.sourceFormat = options.sourceFormat;
      props.hasDocxConversion = options.sourceFormat === 'docx';
    }
    await trackChecksEvent(
      ctx,
      ImageIntegrityTrackEvent.CHECKS_RUN_STARTED,
      buildChecksRunStartedProps(props),
    );
  } catch (err) {
    console.warn('Failed to track Proofig run started', err);
  }
}

export async function trackProofigRunStartFailed(
  ctx: TrackChecksContext,
  workVersionId: string,
  checkRunId: string | undefined,
  failureReason: string,
  options: { trigger?: ChecksAnalyticsTrigger | string | null } = {},
): Promise<void> {
  try {
    const props = await loadChecksRunAnalyticsContext(workVersionId, 'proofig', {
      checkRunId,
      trigger: options.trigger,
      createdByUserId: ctx.user?.id,
    });
    await trackChecksEvent(
      ctx,
      ImageIntegrityTrackEvent.CHECKS_RUN_START_FAILED,
      buildChecksRunStartFailedProps(props, failureReason),
    );
  } catch (err) {
    console.warn('Failed to track Proofig run start failed', err);
  }
}

export async function trackProofigRunRetried(
  ctx: TrackChecksContext,
  workVersionId: string,
  sourceCheckRunId: string,
  newCheckRunId: string,
  options: {
    attempt?: number;
    trigger?: ChecksAnalyticsTrigger | string | null;
  },
): Promise<void> {
  try {
    const props = await loadChecksRunAnalyticsContext(workVersionId, 'proofig', {
      checkRunId: newCheckRunId,
      retryOfRunId: sourceCheckRunId,
      attempt: options.attempt,
      trigger: options.trigger ?? 'retry',
      createdByUserId: ctx.user?.id,
    });
    await trackChecksEvent(ctx, ImageIntegrityTrackEvent.CHECKS_RUN_RETRIED, props);
  } catch (err) {
    console.warn('Failed to track Proofig run retried', err);
  }
}

export async function trackProofigTerminalTransition(
  run: {
    id: string;
    kind: string;
    work_version_id: string;
    created_by_id?: string | null;
    attempt?: number | null;
    retry_of_id?: string | null;
    date_created?: string | Date | null;
  },
  before: ProofigDataSchema | undefined,
  after: ProofigDataSchema | undefined,
  ctx?: TrackChecksContext,
  request?: Request,
): Promise<void> {
  try {
    if (wasProofigTerminal(before)) return;
    const outcome = resolveProofigTerminalOutcomeFromServiceData(after);
    if (!outcome) return;

    const props = {
      ...runLifecyclePropsFromRow(run, 'proofig', {
        proofigState: after?.summary?.state,
        failureReason:
          outcome === 'failed' && after ? resolveProofigFailureReason(after) : undefined,
      }),
    };

    const event =
      outcome === 'completed'
        ? ImageIntegrityTrackEvent.CHECKS_RUN_COMPLETED
        : ImageIntegrityTrackEvent.CHECKS_RUN_FAILED;

    if (ctx) {
      await trackChecksEvent(ctx, event, props);
      return;
    }

    await trackChecksEventForUser(run.created_by_id, event, props, request);
  } catch (err) {
    console.warn('Failed to track Proofig terminal transition', err);
  }
}
