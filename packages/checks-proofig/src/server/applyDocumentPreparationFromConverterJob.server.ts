import { JobStatus } from '@curvenote/scms-db';
import { getPrismaClient } from '@curvenote/scms-server';
import { isProofigAwaitingDocumentPreparationInUi, proofigDataSchema } from '../schema.js';
import {
  completeDocumentPreparation,
  markDocumentPreparationError,
} from './stateMachine.server.js';
import { patchProofigRunServiceData } from './checkRunColumns.server.js';

function lastJobMessage(messages: string[] | null | undefined): string | undefined {
  if (!messages?.length) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]?.trim();
    if (msg) return msg;
  }
  return undefined;
}

export type ApplyDocumentPreparationResult =
  | { ok: true; updated: boolean }
  | { ok: false; message: string };

/**
 * Sync check run `documentPreparation` stage from the linked CONVERTER_TASK job row.
 * No-op when preparation is not in flight or the converter job is still running.
 */
export async function applyDocumentPreparationFromConverterJob(
  checkRunId: string,
): Promise<ApplyDocumentPreparationResult> {
  const prisma = await getPrismaClient();
  const run = await prisma.checkServiceRun.findUnique({ where: { id: checkRunId } });
  if (!run) {
    return { ok: false, message: 'Proofig check run not found.' };
  }

  const rowData = run.data as { serviceData?: unknown } | null;
  const parsed = proofigDataSchema.safeParse(rowData?.serviceData);
  if (!parsed.success || !parsed.data.stages) {
    return { ok: true, updated: false };
  }

  const serviceData = parsed.data;
  if (!isProofigAwaitingDocumentPreparationInUi(serviceData.stages)) {
    return { ok: true, updated: false };
  }

  const converterJobId = serviceData.preparation?.converterJobId?.trim();
  if (!converterJobId) {
    return { ok: true, updated: false };
  }

  const job = await prisma.job.findUnique({ where: { id: converterJobId } });
  if (!job) {
    return { ok: true, updated: false };
  }

  if (
    job.status === JobStatus.QUEUED ||
    job.status === JobStatus.RUNNING ||
    job.status === JobStatus.BLOCKED
  ) {
    return { ok: true, updated: false };
  }

  const receivedAt = new Date().toISOString();

  if (job.status === JobStatus.COMPLETED) {
    await patchProofigRunServiceData(checkRunId, (current) =>
      completeDocumentPreparation(current ?? serviceData, receivedAt),
    );
    return { ok: true, updated: true };
  }

  if (job.status === JobStatus.FAILED || job.status === JobStatus.CANCELLED) {
    const errorMessage =
      lastJobMessage(job.messages) ??
      (job.status === JobStatus.CANCELLED
        ? 'Document conversion was cancelled.'
        : 'Document conversion failed.');
    await patchProofigRunServiceData(
      checkRunId,
      (current) => markDocumentPreparationError(current ?? serviceData, errorMessage, receivedAt),
      receivedAt,
      5,
      { trackTerminalAnalytics: true },
    );
    return { ok: true, updated: true };
  }

  return { ok: true, updated: false };
}
