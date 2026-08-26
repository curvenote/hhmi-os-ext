import { getPrismaClient } from '@curvenote/scms-server';
import { KnownState, proofigDataSchema } from '../schema.js';

/**
 * True when this check run has already recorded a Proofig "Deleted" notification.
 * Later notifies for the same run are ignored at the webhook (no message row, no state updates).
 */
export async function proofigCheckRunAlreadyMarkedDeleted(
  checkServiceRunId: string,
): Promise<boolean> {
  const prisma = await getPrismaClient();
  const row = await prisma.checkServiceRun.findUnique({
    where: { id: checkServiceRunId },
    select: { data: true, kind: true },
  });
  if (!row || row.kind !== 'proofig') return false;
  if (row.data == null || typeof row.data !== 'object') return false;
  const top = row.data as Record<string, unknown>;
  const parsed = proofigDataSchema.safeParse(top.serviceData);
  if (!parsed.success) return false;
  const d = parsed.data;
  return d.deleted === true || d.summary?.state === KnownState.Deleted;
}
