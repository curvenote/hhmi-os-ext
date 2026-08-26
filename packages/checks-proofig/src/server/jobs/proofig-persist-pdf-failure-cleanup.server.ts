import type { CreateJob } from '@curvenote/scms-core';
import type { Context } from '@curvenote/scms-server';
import { JobStatus } from '@curvenote/scms-db';
import { httpError } from '@curvenote/scms-core';
import { z } from 'zod';
import { getPrismaClient, jobs } from '@curvenote/scms-server';
import { markProofigReportPdfError } from '../../proofigReportFiles.js';
import { patchProofigRunServiceData } from '../checkRunColumns.server.js';
import { enqueueProofigPersistPdfFollowUpIfNeeded } from '../enqueue-proofig-persist-pdf.server.js';
import { PROOFIG_PERSIST_PDF_FAILURE_CLEANUP } from './proofigPersistPdf.constants.js';

export { PROOFIG_PERSIST_PDF_FAILURE_CLEANUP };

const PayloadSchema = z.object({
  check_service_run_id: z.string().min(1, 'check_service_run_id is required'),
  /** Report id the failed persist targeted (for stale follow-up detection). */
  report_id: z.string().min(1).optional(),
});

export type CreateProofigPersistPdfFailureCleanupPayload = z.infer<typeof PayloadSchema>;

function lastJobMessage(messages: unknown): string | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  return undefined;
}

/**
 * Promoted when PROOFIG_PERSIST_PDF fails. Writes a user-visible error onto check-run
 * serviceData so the PDF actions UI can leave the perpetual “Preparing…” state.
 */
export async function proofigPersistPdfFailureCleanupHandler(_ctx: Context, data: CreateJob) {
  const parseResult = PayloadSchema.safeParse(data.payload);
  if (!parseResult.success) {
    const msg = parseResult.error.issues.map((e) => e.message).join('; ');
    throw httpError(400, `Invalid ${PROOFIG_PERSIST_PDF_FAILURE_CLEANUP} payload: ${msg}`);
  }

  const { check_service_run_id: checkServiceRunId, report_id: jobReportId } = parseResult.data;
  const prisma = await getPrismaClient();

  const cleanupRow = await prisma.job.findUnique({
    where: { id: data.id },
    select: { depends_on_job_id: true },
  });
  const parentJobId = cleanupRow?.depends_on_job_id?.trim() || undefined;
  const parent = parentJobId
    ? await prisma.job.findUnique({
        where: { id: parentJobId },
        select: { id: true, messages: true, payload: true },
      })
    : null;

  const parentPayload = parent?.payload as { report_id?: unknown } | null | undefined;
  const resolvedReportId =
    jobReportId ??
    (typeof parentPayload?.report_id === 'string' ? parentPayload.report_id : undefined);

  const rawMessage = lastJobMessage(parent?.messages) ?? 'Proofig report PDF generation failed';

  await patchProofigRunServiceData(checkServiceRunId, (sd) =>
    markProofigReportPdfError(sd, rawMessage, undefined, resolvedReportId),
  );

  if (parentJobId) {
    try {
      await enqueueProofigPersistPdfFollowUpIfNeeded(checkServiceRunId, {
        excludeJobId: parentJobId,
        jobReportId: resolvedReportId,
      });
    } catch (err) {
      console.error('[proofig] follow-up persist enqueue after PDF failure cleanup failed', {
        checkServiceRunId,
        parentJobId,
        err,
      });
    }
  }

  return jobs.dbUpdateJob(data.id, {
    status: JobStatus.COMPLETED,
    message: 'Proofig check run marked with report PDF generation error',
    results: {
      check_service_run_id: checkServiceRunId,
      failed_job_id: parentJobId,
    },
  });
}
