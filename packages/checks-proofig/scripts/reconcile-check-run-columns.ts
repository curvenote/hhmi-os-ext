/**
 * One-off reconcile: copy derived failure state into CheckServiceRun columns for staging rows.
 *
 * Usage (from repo root with DATABASE_URL configured):
 *   npx tsx packages/checks-proofig/scripts/reconcile-check-run-columns.ts
 */
import { getPrismaClient } from '@curvenote/scms-server';
import { isProofigRunFailed } from '../src/server/isRunFailed.server.js';
import {
  deriveProofigFailedAt,
  errorColumnPatch,
  healthyColumnPatch,
} from '../src/server/checkRunColumns.server.js';

const PROOFIG_KIND = 'proofig';
const BATCH_SIZE = 100;

async function main() {
  const prisma = await getPrismaClient();
  let cursor: string | undefined;
  let updated = 0;
  let scanned = 0;

  for (;;) {
    const rows = await prisma.checkServiceRun.findMany({
      where: { kind: PROOFIG_KIND },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;

    for (const run of rows) {
      scanned += 1;
      const failed = isProofigRunFailed(run);
      const targetStatus = failed ? 'error' : 'healthy';
      const targetFailedAt = failed
        ? (run.failed_at ?? deriveProofigFailedAt(run))
        : null;

      const needsStatus = run.status !== targetStatus;
      const needsFailedAt = run.failed_at !== targetFailedAt;
      if (!needsStatus && !needsFailedAt) continue;

      const patch = failed ? errorColumnPatch(targetFailedAt!) : healthyColumnPatch();
      await prisma.checkServiceRun.update({
        where: { id: run.id },
        data: {
          ...patch,
          date_modified: new Date().toISOString(),
        },
      });
      updated += 1;
    }

    cursor = rows[rows.length - 1]?.id;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(JSON.stringify({ kind: PROOFIG_KIND, scanned, updated }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
