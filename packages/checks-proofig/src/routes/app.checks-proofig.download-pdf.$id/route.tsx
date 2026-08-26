import type { LoaderFunctionArgs } from 'react-router';
import { error405, httpError } from '@curvenote/scms-core';
import {
  File,
  KnownBuckets,
  StorageBackend,
  getPrismaClient,
  withAppContext,
} from '@curvenote/scms-server';
import { trackChecksEvent } from '@hhmi/checks-shared/analytics/server';
import { loadChecksRunAnalyticsContext } from '@hhmi/checks-shared/analytics/runContext.server';
import { ImageIntegrityTrackEvent } from '../../analytics.catalog.js';
import { proofigDataSchema } from '../../schema.js';
import {
  PROOFIG_REPORT_FILENAME,
  clearStoredProofigReport,
  getProofigPdfReadiness,
  getStoredProofigReportFile,
} from '../../proofigReportFiles.js';
import { assertWorkChecksReadForRun } from '../../server/checkWorkScopes.server.js';
import { patchProofigRunServiceData } from '../../server/checkRunColumns.server.js';
import { enqueueProofigPersistPdfIfNeeded } from '../../server/enqueue-proofig-persist-pdf.server.js';

type CheckServiceRunData = {
  serviceData?: unknown;
};

function pdfPendingResponse(reason: string, message?: string) {
  return Response.json(
    {
      status: 'pending',
      reason,
      message: message ?? 'Proofig report PDF is not ready for download yet.',
    },
    { status: 409 },
  );
}

function pdfFailedResponse(reason: string, message?: string) {
  return Response.json(
    {
      status: 'failed',
      reason,
      message: message ?? 'Proofig report PDF generation failed.',
    },
    { status: 409 },
  );
}

export async function action() {
  throw error405();
}

/**
 * Clear stale stored-report metadata when the CDN object is missing, then best-effort
 * re-enqueue a persist so `shouldPersistProofigReport` can run again.
 */
async function healMissingStoredReport(checkServiceRunId: string): Promise<void> {
  await patchProofigRunServiceData(checkServiceRunId, (sd) => clearStoredProofigReport(sd));
  try {
    await enqueueProofigPersistPdfIfNeeded(checkServiceRunId);
  } catch (err) {
    console.error('[proofig] re-enqueue after missing stored PDF failed', {
      checkServiceRunId,
      err,
    });
  }
}

/**
 * Stream the persisted Proofig report PDF for a check run from work version storage.
 * Only serves when readiness is `stored-current` (PDF for the current report id), matching the UI.
 */
export async function loader(args: LoaderFunctionArgs) {
  const ctx = await withAppContext(args);
  if (!ctx.user) {
    throw httpError(401, 'Authentication required');
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
  const parsed = proofigDataSchema.safeParse(runData?.serviceData);
  const serviceData = parsed.success ? parsed.data : undefined;
  const readiness = getProofigPdfReadiness(serviceData);
  if (readiness === 'failed') {
    return pdfFailedResponse(
      'persist-failed',
      serviceData?.proofigReportPdfError?.trim() || 'Proofig report PDF generation failed.',
    );
  }
  if (readiness !== 'stored-current') {
    const hasFile = Boolean(getStoredProofigReportFile(serviceData)?.path);
    return pdfPendingResponse(
      readiness === 'stored-stale' || hasFile ? 'stale-stored-report' : 'no-stored-file',
    );
  }
  // Safe: stored-current requires a generated-slot entry with a path.
  const storedFile = getStoredProofigReportFile(serviceData)!;

  if (!run.work_version_id) {
    return pdfPendingResponse('no-work-version');
  }
  const workVersion = await prisma.workVersion.findUnique({
    where: { id: run.work_version_id },
    select: { cdn: true, cdn_key: true },
  });
  if (!workVersion?.cdn?.trim() || !workVersion.cdn_key?.trim()) {
    return pdfPendingResponse('storage-unavailable');
  }

  const backend = new StorageBackend(ctx, [KnownBuckets.prv, KnownBuckets.pub]);
  const bucket = backend.knownBucketFromCDN(workVersion.cdn);
  if (!bucket) {
    return pdfPendingResponse('unknown-bucket');
  }

  const file = new File(backend, storedFile.path, bucket);
  if (!(await file.exists())) {
    await healMissingStoredReport(id);
    return pdfPendingResponse(
      'stored-file-missing',
      'Report PDF file is missing from storage; regenerating.',
    );
  }

  const stream = await file.readStream();
  void loadChecksRunAnalyticsContext(run.work_version_id, 'proofig', {
    checkRunId: id,
  })
    .then((props) => trackChecksEvent(ctx, ImageIntegrityTrackEvent.CHECKS_PDF_DOWNLOADED, props))
    .catch((err) => {
      console.error('[proofig] PDF download analytics failed', {
        checkRunId: id,
        err,
      });
    });
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${storedFile.name || PROOFIG_REPORT_FILENAME}"`,
    },
  });
}
