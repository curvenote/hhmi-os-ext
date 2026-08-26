import type {
  ExtensionCheckHandleActionArgs,
  ExtensionCheckHandleActionResult,
} from '@curvenote/scms-core';
import { getConfig, getPrismaClient } from '@curvenote/scms-server';
import { isProofigRunFailed } from './isRunFailed.server.js';
import {
  isProofigRunSupersededByRetry,
  markProofigSourceRunSupersededByRetry,
} from './runSuperseded.server.js';
import { startProofigCheckRun } from './startCheckRun.server.js';
import { trackProofigRunRetried } from './analytics.server.js';
import type { ChecksAnalyticsTrigger } from '@hhmi/checks-shared/analytics/properties';

const PROOFIG_KIND = 'proofig';

export type ProofigRetryMode = 'user' | 'admin';

/**
 * Retry a failed Proofig check run by creating a new run on the same work version.
 */
export async function retryProofigCheckRun(
  ctx: NonNullable<ExtensionCheckHandleActionArgs['ctx']>,
  workVersionId: string,
  sourceCheckRunId: string,
  mode: ProofigRetryMode,
  options: { trigger?: ChecksAnalyticsTrigger | string | null } = {},
): Promise<ExtensionCheckHandleActionResult> {
  const prisma = await getPrismaClient();
  const sourceRun = await prisma.checkServiceRun.findFirst({
    where: {
      id: sourceCheckRunId.trim(),
      work_version_id: workVersionId,
      kind: PROOFIG_KIND,
    },
  });
  if (!sourceRun) {
    return {
      error: { type: 'general', message: 'Proofig check run not found for this work version.' },
      status: 404,
    };
  }
  if (!isProofigRunFailed(sourceRun)) {
    return {
      error: { type: 'general', message: 'Only failed check runs can be retried.' },
      status: 400,
    };
  }
  if (isProofigRunSupersededByRetry(sourceRun)) {
    return {
      error: { type: 'general', message: 'This check run has already been retried.' },
      status: 400,
    };
  }

  const appConfig = await getConfig();
  const serviceAccountId = appConfig.api.submissionsServiceAccount?.id ?? ctx.user?.id;
  const createdById =
    mode === 'admin'
      ? (sourceRun.created_by_id ?? ctx.user?.id ?? undefined)
      : (ctx.user?.id ?? undefined);

  const retryTrigger = options.trigger ?? (mode === 'admin' ? 'admin' : 'retry');

  const result = await startProofigCheckRun(ctx, workVersionId, {
    createdById,
    invokedById: serviceAccountId,
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
  try {
    await markProofigSourceRunSupersededByRetry(sourceRun.id, result.checkRunId, ctx.user?.id);
  } catch (err) {
    console.error(
      `Proofig retry created run ${result.checkRunId} but failed to mark source ${sourceRun.id} as superseded`,
      err,
    );
  }
  void trackProofigRunRetried(ctx, workVersionId, sourceRun.id, result.checkRunId, {
    attempt: (sourceRun.attempt ?? 1) + 1,
    trigger: retryTrigger,
  });
  return { success: true, checkRunId: result.checkRunId } as ExtensionCheckHandleActionResult & {
    checkRunId: string;
  };
}

export type ProofigBulkRetryItemResult =
  | { runId: string; ok: true; checkRunId: string }
  | { runId: string; ok: false; message: string; eulaSkip?: boolean };

/** Admin bulk retry: each run is retried on behalf of its original submitter. */
export async function retryProofigFailedRunsBulk(
  ctx: NonNullable<ExtensionCheckHandleActionArgs['ctx']>,
  runIds: string[],
): Promise<{ results: ProofigBulkRetryItemResult[] }> {
  const uniqueIds = [...new Set(runIds.map((id) => id.trim()).filter(Boolean))];
  const results: ProofigBulkRetryItemResult[] = [];

  for (const runId of uniqueIds) {
    const prisma = await getPrismaClient();
    const sourceRun = await prisma.checkServiceRun.findFirst({
      where: { id: runId, kind: PROOFIG_KIND },
    });
    if (!sourceRun) {
      results.push({ runId, ok: false, message: 'Check run not found.' });
      continue;
    }
    const outcome = await retryProofigCheckRun(ctx, sourceRun.work_version_id, runId, 'admin');
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
