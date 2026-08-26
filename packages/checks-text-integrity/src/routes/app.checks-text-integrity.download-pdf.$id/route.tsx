import type { LoaderFunctionArgs } from 'react-router';
import { error405, httpError } from '@curvenote/scms-core';
import {
  getPrismaClient,
  withAppContext,
  File,
  KnownBuckets,
  StorageBackend,
} from '@curvenote/scms-server';
import type { TextIntegrityDataSchema } from '../../schema.js';
import { MINIMAL_TEXT_INTEGRITY_SERVICE_DATA } from '../../schema.js';
import { assertSubmitterEulaAccepted } from '../../server/eula.server.js';
import { resolveSimilarityReportDownloadSource } from '../../server/similarity-report-download.server.js';
import { assertWorkChecksReadForRun } from '../../server/checkWorkScopes.server.js';
import { TextIntegrityTrackEvent } from '../../analytics.catalog.js';
import { loadChecksRunAnalyticsContext } from '@hhmi/checks-shared/analytics/runContext.server';
import { trackChecksEvent } from '@hhmi/checks-shared/analytics/server';

type CheckServiceRunData = {
  status: string;
  serviceData?: TextIntegrityDataSchema;
};

function pdfPendingResponse(reason: string) {
  return Response.json(
    {
      status: 'pending',
      reason,
      message: 'Similarity PDF report is not ready for download yet.',
    },
    { status: 409 },
  );
}

export async function action() {
  throw error405();
}

export async function loader(args: LoaderFunctionArgs) {
  const ctx = await withAppContext(args);
  if (!ctx.user) {
    throw httpError(401, 'Authentication required');
  }
  const eulaBlock = await assertSubmitterEulaAccepted(ctx);
  if (eulaBlock) {
    throw httpError(403, eulaBlock);
  }

  const id = args.params.id;
  if (!id) {
    throw httpError(400, 'Missing check service run id');
  }

  const prisma = await getPrismaClient();
  const run = await prisma.checkServiceRun.findUnique({ where: { id } });
  if (!run) {
    throw httpError(404, 'Check run not found');
  }

  const readGate = await assertWorkChecksReadForRun(ctx, run.work_version_id);
  if (!readGate.ok) {
    throw httpError(readGate.result.status ?? 403, readGate.result.error?.message ?? 'Forbidden');
  }

  const runData = run.data as CheckServiceRunData | null;
  const serviceData = runData?.serviceData ?? MINIMAL_TEXT_INTEGRITY_SERVICE_DATA;
  const downloadSource = resolveSimilarityReportDownloadSource(serviceData);

  if (downloadSource.kind === 'storage' && run.work_version_id) {
    const workVersion = await prisma.workVersion.findUnique({
      where: { id: run.work_version_id },
      select: { cdn: true, cdn_key: true },
    });
    if (workVersion?.cdn?.trim() && workVersion.cdn_key?.trim()) {
      const backend = new StorageBackend(ctx, [KnownBuckets.prv, KnownBuckets.pub]);
      const bucket = backend.knownBucketFromCDN(workVersion.cdn);
      if (bucket) {
        const file = new File(backend, downloadSource.path, bucket);
        if (await file.exists()) {
          const stream = await file.readStream();
          void loadChecksRunAnalyticsContext(run.work_version_id, 'checks-text-integrity', {
            checkRunId: id,
          }).then((props) =>
            trackChecksEvent(ctx, TextIntegrityTrackEvent.CHECKS_PDF_DOWNLOADED, props),
          );
          return new Response(stream as unknown as ReadableStream, {
            status: 200,
            headers: {
              'Content-Type': downloadSource.contentType,
              'Content-Disposition': `attachment; filename="${downloadSource.filename}"`,
            },
          });
        }
      }
    }
    return pdfPendingResponse('stored-file-missing');
  }

  return pdfPendingResponse(
    downloadSource.kind === 'pending' ? downloadSource.reason : 'storage-unavailable',
  );
}
