import { getPrismaClient } from '@curvenote/scms-server';
import type { CheckRunContext, CheckRunCoarseStatus } from './types.js';

function normalizeCoarseStatus(status: string | null | undefined): CheckRunCoarseStatus {
  if (status === 'healthy' || status === 'error' || status === 'unknown') return status;
  return 'unknown';
}

/** Load check run row with work id for Slack metadata links. */
export async function loadCheckRunContext(checkRunId: string): Promise<CheckRunContext | null> {
  try {
    const prisma = await getPrismaClient();
    const run = await prisma.checkServiceRun.findUnique({
      where: { id: checkRunId },
      select: {
        id: true,
        kind: true,
        work_version_id: true,
        created_by_id: true,
        status: true,
        work_version: {
          select: { work_id: true },
        },
      },
    });
    if (!run) return null;
    return {
      checkRunId: run.id,
      checkKind: run.kind,
      workVersionId: run.work_version_id,
      workId: run.work_version?.work_id,
      createdById: run.created_by_id,
      coarseStatus: normalizeCoarseStatus(run.status),
    };
  } catch (err) {
    console.error('[checks-notify] loadCheckRunContext failed', err);
    return null;
  }
}
