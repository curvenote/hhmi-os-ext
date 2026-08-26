import { TextIntegrityTrackEvent } from '../analytics.catalog.js';
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
import type { TextIntegrityDataSchema } from '../schema.js';
import { canShowResults, hasPipelineError } from '../serviceDataSchemas.js';

type TextIntegrityTerminalOutcome = 'completed' | 'failed';

/** Analytics terminal state — narrower than UI/run-failure (waits for summaryReport). */
export function resolveTextIntegrityTerminalOutcome(
  serviceData: TextIntegrityDataSchema | undefined,
): TextIntegrityTerminalOutcome | null {
  if (!serviceData) return null;
  if (hasPipelineError(serviceData)) return 'failed';
  if (canShowResults(serviceData) && serviceData.summaryReport) return 'completed';
  if (serviceData.stages?.reportGeneration?.status === 'error') return 'failed';
  return null;
}

function wasTextIntegrityTerminal(serviceData: TextIntegrityDataSchema | undefined): boolean {
  return resolveTextIntegrityTerminalOutcome(serviceData) != null;
}

export async function trackTextIntegrityRunStarted(
  ctx: TrackChecksContext,
  workVersionId: string,
  checkRunId: string,
  options: {
    attempt?: number;
    retryOfRunId?: string;
    trigger?: ChecksAnalyticsTrigger | string | null;
    manifestVersion?: string;
    invokedByUserId?: string;
  },
): Promise<void> {
  try {
    const props = await loadChecksRunAnalyticsContext(workVersionId, 'checks-text-integrity', {
      checkRunId,
      attempt: options.attempt,
      retryOfRunId: options.retryOfRunId,
      trigger: options.trigger,
      manifestVersion: options.manifestVersion,
      createdByUserId: ctx.user?.id,
      invokedByUserId: options.invokedByUserId ?? ctx.user?.id,
    });
    await trackChecksEvent(
      ctx,
      TextIntegrityTrackEvent.CHECKS_RUN_STARTED,
      buildChecksRunStartedProps(props),
    );
  } catch (err) {
    console.warn('Failed to track Text Integrity run started', err);
  }
}

export async function trackTextIntegrityRunStartFailed(
  ctx: TrackChecksContext,
  workVersionId: string,
  checkRunId: string | undefined,
  failureReason: string,
  options: {
    trigger?: ChecksAnalyticsTrigger | string | null;
    manifestVersion?: string;
  } = {},
): Promise<void> {
  try {
    const props = await loadChecksRunAnalyticsContext(workVersionId, 'checks-text-integrity', {
      checkRunId,
      trigger: options.trigger,
      manifestVersion: options.manifestVersion,
      createdByUserId: ctx.user?.id,
    });
    await trackChecksEvent(
      ctx,
      TextIntegrityTrackEvent.CHECKS_RUN_START_FAILED,
      buildChecksRunStartFailedProps(props, failureReason),
    );
  } catch (err) {
    console.warn('Failed to track Text Integrity run start failed', err);
  }
}

export async function trackTextIntegrityRunRetried(
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
    const props = await loadChecksRunAnalyticsContext(workVersionId, 'checks-text-integrity', {
      checkRunId: newCheckRunId,
      retryOfRunId: sourceCheckRunId,
      attempt: options.attempt,
      trigger: options.trigger ?? 'retry',
      createdByUserId: ctx.user?.id,
    });
    await trackChecksEvent(ctx, TextIntegrityTrackEvent.CHECKS_RUN_RETRIED, props);
  } catch (err) {
    console.warn('Failed to track Text Integrity run retried', err);
  }
}

export async function trackTextIntegrityTerminalTransition(
  run: {
    id: string;
    kind: string;
    work_version_id: string;
    created_by_id?: string | null;
    attempt?: number | null;
    retry_of_id?: string | null;
    date_created?: string | Date | null;
  },
  before: TextIntegrityDataSchema | undefined,
  after: TextIntegrityDataSchema | undefined,
  ctx?: TrackChecksContext,
  request?: Request,
): Promise<void> {
  try {
    if (wasTextIntegrityTerminal(before)) return;
    const outcome = resolveTextIntegrityTerminalOutcome(after);
    if (!outcome) return;

    const similarityScore = after?.summaryReport?.overallMatchPercentage;
    const props = {
      ...runLifecyclePropsFromRow(run, 'checks-text-integrity', {
        similarityScore,
        hasPdfReport: Boolean(after?.similarityReportStored),
        failureReason:
          outcome === 'failed'
            ? sanitizeAnalyticsErrorMessage(
                after?.stages?.processing?.error ??
                  after?.stages?.submission?.error ??
                  after?.stages?.reportGeneration?.error ??
                  'Text integrity check failed',
              )
            : undefined,
      }),
    };

    const event =
      outcome === 'completed'
        ? TextIntegrityTrackEvent.CHECKS_RUN_COMPLETED
        : TextIntegrityTrackEvent.CHECKS_RUN_FAILED;

    if (ctx) {
      await trackChecksEvent(ctx, event, props);
      return;
    }

    await trackChecksEventForUser(run.created_by_id, event, props, request);
  } catch (err) {
    console.warn('Failed to track Text Integrity terminal transition', err);
  }
}
