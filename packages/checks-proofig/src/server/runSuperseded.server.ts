import { getPrismaClient } from '@curvenote/scms-server';

type RunRow = {
  retried?: boolean | null;
  successor_id?: string | null;
};

/** True when a failed run was already retried and should leave the admin failed-runs list. */
export function isProofigRunSupersededByRetry(run: RunRow): boolean {
  return run.retried === true || Boolean(run.successor_id?.trim());
}

export async function markProofigSourceRunSupersededByRetry(
  sourceRunId: string,
  supersededByRunId: string,
  _supersededByUserId: string | undefined,
): Promise<void> {
  const retriedAt = new Date().toISOString();
  const prisma = await getPrismaClient();
  await prisma.checkServiceRun.update({
    where: { id: sourceRunId },
    data: {
      retried: true,
      retried_at: retriedAt,
      successor_id: supersededByRunId,
      date_modified: retriedAt,
    },
  });
}
