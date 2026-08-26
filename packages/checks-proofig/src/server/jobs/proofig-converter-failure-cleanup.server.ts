import type { CreateJob } from '@curvenote/scms-core';
import type { Context } from '@curvenote/scms-server';
import { JobStatus } from '@curvenote/scms-db';
import { httpError } from '@curvenote/scms-core';
import { z } from 'zod';
import { jobs } from '@curvenote/scms-server';
import { applyDocumentPreparationFromConverterJob } from '../applyDocumentPreparationFromConverterJob.server.js';

/** Terminal cleanup when a DOCX CONVERTER_TASK parent fails. */
export const PROOFIG_CONVERTER_FAILURE_CLEANUP = 'PROOFIG_CONVERTER_FAILURE_CLEANUP';

const CreateProofigConverterFailureCleanupPayloadSchema = z.object({
  proofig_run_id: z.string().min(1, 'proofig_run_id is required'),
});

export type CreateProofigConverterFailureCleanupPayload = z.infer<
  typeof CreateProofigConverterFailureCleanupPayloadSchema
>;

/**
 * Promoted when a DOCX CONVERTER_TASK parent fails. Marks the linked Proofig check run
 * error state without requiring client-side hydrate polling.
 */
export async function proofigConverterFailureCleanupHandler(_ctx: Context, data: CreateJob) {
  const parseResult = CreateProofigConverterFailureCleanupPayloadSchema.safeParse(data.payload);
  if (!parseResult.success) {
    const msg = parseResult.error.issues.map((e) => e.message).join('; ');
    throw httpError(400, `Invalid ${PROOFIG_CONVERTER_FAILURE_CLEANUP} payload: ${msg}`);
  }

  const applyResult = await applyDocumentPreparationFromConverterJob(
    parseResult.data.proofig_run_id,
  );
  if (!applyResult.ok) {
    return jobs.dbUpdateJob(data.id, {
      status: JobStatus.FAILED,
      message: applyResult.message,
    });
  }

  return jobs.dbUpdateJob(data.id, {
    status: JobStatus.COMPLETED,
    message: applyResult.updated
      ? 'Proofig check run marked error after converter failure'
      : 'Proofig check run already terminal after converter failure',
    results: { updated: applyResult.updated },
  });
}
