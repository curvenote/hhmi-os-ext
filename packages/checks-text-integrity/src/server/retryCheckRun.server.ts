import type {
  ExtensionCheckHandleActionArgs,
  ExtensionCheckHandleActionResult,
} from '@curvenote/scms-core';
import { getConfig, getPrismaClient } from '@curvenote/scms-server';
import {
  assertOriginalSubmitterEulaCurrent,
  assertSubmitterEulaAccepted,
  getEulaStatusForUser,
} from './eula.server.js';
import { isTextIntegrityRunFailed } from './isRunFailed.server.js';
import {
  isTextIntegrityRunSupersededByRetry,
  markTextIntegritySourceRunSupersededByRetry,
  releaseTextIntegrityRunRetrySweepClaim,
  findExistingTextIntegrityRetrySuccessorId,
  recordTextIntegritySweepMarkSupersededFailure,
  TEXT_INTEGRITY_MAX_SWEEP_MARK_SUPERSEDED_FAILURES,
} from './runSuperseded.server.js';
import { markCheckServiceRunNoAutoRetry } from './checkRunColumns.server.js';
import { startTextIntegrityCheckRun } from './startCheckRun.server.js';
import { trackTextIntegrityRunRetried } from './analytics.server.js';
import type { ChecksAnalyticsTrigger } from '@hhmi/checks-shared/analytics/properties';

const TEXT_INTEGRITY_KIND = 'checks-text-integrity';

export type TextIntegrityRetryMode = 'user' | 'admin';

export type TextIntegrityRetryOptions = {
  scheduledAt?: string;
  /** When true, skip per-run Slack (cron sweep emits one summary instead). */
  suppressSlack?: boolean;
  trigger?: ChecksAnalyticsTrigger | string | null;
};

/**
 * Retry a failed Text Integrity check run by creating a new run on the same work version.
 */
export async function retryTextIntegrityCheckRun(
  ctx: NonNullable<ExtensionCheckHandleActionArgs['ctx']>,
  workVersionId: string,
  sourceCheckRunId: string,
  mode: TextIntegrityRetryMode,
  options: TextIntegrityRetryOptions = {},
): Promise<ExtensionCheckHandleActionResult> {
  const prisma = await getPrismaClient();
  const sourceRun = await prisma.checkServiceRun.findFirst({
    where: {
      id: sourceCheckRunId.trim(),
      work_version_id: workVersionId,
      kind: TEXT_INTEGRITY_KIND,
    },
  });
  if (!sourceRun) {
    return {
      error: {
        type: 'general',
        message: 'Text Integrity check run not found for this work version.',
      },
      status: 404,
    };
  }
  if (!isTextIntegrityRunFailed(sourceRun)) {
    return {
      error: { type: 'general', message: 'Only failed check runs can be retried.' },
      status: 400,
    };
  }
  if (isTextIntegrityRunSupersededByRetry(sourceRun)) {
    return {
      error: { type: 'general', message: 'This check run has already been retried.' },
      status: 400,
    };
  }

  if (mode === 'user') {
    const eulaBlock = await assertSubmitterEulaAccepted(ctx);
    if (eulaBlock) {
      const status = await getEulaStatusForUser(ctx);
      return {
        error: { type: 'general', message: eulaBlock },
        status: 400,
        requiresEula: true,
        requireEula: status.requireEula,
        eula: status.eula,
      };
    }
  } else {
    const eulaCheck = await assertOriginalSubmitterEulaCurrent(ctx, sourceRun.created_by_id);
    if (!eulaCheck.ok) {
      return {
        error: { type: 'general', message: eulaCheck.message },
        status: 400,
        eulaSkip: true,
      } as ExtensionCheckHandleActionResult & { eulaSkip: boolean };
    }
  }

  const appConfig = await getConfig();
  const serviceAccountId = appConfig.api.submissionsServiceAccount?.id ?? ctx.user?.id;
  const createdById =
    mode === 'admin' ? (sourceRun.created_by_id ?? undefined) : (ctx.user?.id ?? undefined);

  const existingSuccessorId = await findExistingTextIntegrityRetrySuccessorId(sourceRun.id);
  let checkRunId: string;
  const retryTrigger =
    options.trigger ?? (mode === 'admin' ? (options.scheduledAt ? 'cron' : 'admin') : 'retry');
  if (existingSuccessorId) {
    checkRunId = existingSuccessorId;
  } else {
    const result = await startTextIntegrityCheckRun(ctx, workVersionId, {
      createdById,
      invokedById: serviceAccountId,
      scheduledAt: options.scheduledAt,
      suppressSlack: options.suppressSlack,
      trigger: retryTrigger,
      lineage: {
        retryOfRunId: sourceRun.id,
        sourceAttempt: (sourceRun.attempt ?? 1) + 1,
      },
    });
    if (!result.ok) {
      return {
        error: { type: 'general', message: result.message },
        status: result.status,
      };
    }
    checkRunId = result.checkRunId;
  }

  try {
    await markTextIntegritySourceRunSupersededByRetry(sourceRun.id, checkRunId, ctx.user?.id);
  } catch (err) {
    console.error(
      `Text Integrity retry created run ${checkRunId} but failed to mark source ${sourceRun.id} as superseded`,
      err,
    );
    const failures = await recordTextIntegritySweepMarkSupersededFailure(sourceRun.id);
    await releaseTextIntegrityRunRetrySweepClaim(sourceRun.id).catch((releaseErr) => {
      console.error(
        `Text Integrity retry failed to release sweep claim on source ${sourceRun.id}`,
        releaseErr,
      );
    });
    if (failures >= TEXT_INTEGRITY_MAX_SWEEP_MARK_SUPERSEDED_FAILURES) {
      await markCheckServiceRunNoAutoRetry(sourceRun.id);
    }
    return {
      error: {
        type: 'general',
        message: 'Retry run exists but marking the source superseded failed.',
      },
      status: 500,
      markSupersededFailed: true,
      checkRunId,
    } as ExtensionCheckHandleActionResult & {
      markSupersededFailed: true;
      checkRunId: string;
    };
  }
  if (!existingSuccessorId) {
    void trackTextIntegrityRunRetried(ctx, workVersionId, sourceRun.id, checkRunId, {
      attempt: (sourceRun.attempt ?? 1) + 1,
      trigger: retryTrigger,
    });
  }
  return { success: true, checkRunId } as ExtensionCheckHandleActionResult & {
    checkRunId: string;
  };
}

export type TextIntegrityBulkRetryItemResult =
  | { runId: string; ok: true; checkRunId: string }
  | { runId: string; ok: false; message: string; eulaSkip?: boolean };

/** Admin bulk retry: each run is retried on behalf of its original submitter. */
export async function retryTextIntegrityFailedRunsBulk(
  ctx: NonNullable<ExtensionCheckHandleActionArgs['ctx']>,
  runIds: string[],
): Promise<{ results: TextIntegrityBulkRetryItemResult[] }> {
  const uniqueIds = [...new Set(runIds.map((id) => id.trim()).filter(Boolean))];
  const results: TextIntegrityBulkRetryItemResult[] = [];

  for (const runId of uniqueIds) {
    const prisma = await getPrismaClient();
    const sourceRun = await prisma.checkServiceRun.findFirst({
      where: { id: runId, kind: TEXT_INTEGRITY_KIND },
    });
    if (!sourceRun) {
      results.push({ runId, ok: false, message: 'Check run not found.' });
      continue;
    }
    const outcome = await retryTextIntegrityCheckRun(
      ctx,
      sourceRun.work_version_id,
      runId,
      'admin',
    );
    if ('success' in outcome && outcome.success) {
      const checkRunId = (outcome as { checkRunId?: string }).checkRunId ?? '';
      results.push({ runId, ok: true, checkRunId });
    } else {
      const message = outcome.error?.message ?? 'Retry failed';
      results.push({
        runId,
        ok: false,
        message,
        eulaSkip: (outcome as { eulaSkip?: boolean }).eulaSkip,
      });
    }
  }

  return { results };
}
