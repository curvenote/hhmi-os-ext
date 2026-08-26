import { hasDocxInMetadata, hasPdfInMetadata } from '@curvenote/scms-core';
import { getPrismaClient } from '@curvenote/scms-server';
import type { ChecksAnalyticsTrigger, ChecksKind, ChecksRunLifecycleProps } from './properties.js';
import { computeDurationMs, normalizeChecksTrigger, resolveSourceFormat } from './properties.js';

export type CheckRunRowForAnalytics = {
  id: string;
  kind: string;
  work_version_id: string;
  created_by_id?: string | null;
  attempt?: number | null;
  retry_of_id?: string | null;
  date_created?: string | Date | null;
};

export async function loadChecksRunAnalyticsContext(
  workVersionId: string,
  checkKind: ChecksKind,
  options: {
    checkRunId?: string;
    attempt?: number;
    retryOfRunId?: string;
    trigger?: ChecksAnalyticsTrigger | string | null;
    createdByUserId?: string;
    invokedByUserId?: string;
    manifestVersion?: string;
    eulaVersion?: string;
  } = {},
): Promise<ChecksRunLifecycleProps> {
  const prisma = await getPrismaClient();
  const workVersion = await prisma.workVersion.findUnique({
    where: { id: workVersionId },
    select: { id: true, work_id: true, metadata: true },
  });

  const metadata =
    workVersion?.metadata != null && typeof workVersion.metadata === 'object'
      ? workVersion.metadata
      : null;
  const hasPdf = hasPdfInMetadata(metadata);
  const hasDocx = hasDocxInMetadata(metadata);

  return {
    checkKind,
    workId: workVersion?.work_id,
    workVersionId,
    checkRunId: options.checkRunId,
    attempt: options.attempt,
    retryOfRunId: options.retryOfRunId,
    trigger: normalizeChecksTrigger(options.trigger),
    sourceFormat: resolveSourceFormat(hasPdf, hasDocx),
    createdByUserId: options.createdByUserId,
    invokedByUserId: options.invokedByUserId,
    manifestVersion: options.manifestVersion,
    eulaVersion: options.eulaVersion,
  };
}

export function runLifecyclePropsFromRow(
  run: CheckRunRowForAnalytics,
  checkKind: ChecksKind,
  extras: Partial<ChecksRunLifecycleProps> = {},
): ChecksRunLifecycleProps {
  return {
    checkKind,
    workVersionId: run.work_version_id,
    checkRunId: run.id,
    attempt: run.attempt ?? undefined,
    retryOfRunId: run.retry_of_id ?? undefined,
    createdByUserId: run.created_by_id ?? undefined,
    durationMs: computeDurationMs(run.date_created ?? undefined),
    ...extras,
  };
}
