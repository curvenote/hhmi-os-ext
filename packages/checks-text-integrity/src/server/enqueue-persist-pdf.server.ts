import { uuidv7 as uuid } from 'uuidv7';
import { enqueueAndDispatchJob } from '@curvenote/scms-server';
import { TEXT_INTEGRITY_PERSIST_PDF } from './jobs/text-integrity-persist-pdf.server.js';

/**
 * Enqueue background persistence of the similarity PDF after report generation completes.
 * Failures are logged; the notify webhook still returns success.
 */
export async function enqueueTextIntegrityPersistPdfJob(
  workVersionId: string,
  checkServiceRunId: string,
  invokedById?: string,
): Promise<void> {
  try {
    await enqueueAndDispatchJob({
      job_id: uuid(),
      job_type: TEXT_INTEGRITY_PERSIST_PDF,
      payload: {
        work_version_id: workVersionId,
        check_service_run_id: checkServiceRunId,
      },
      invoked_by_id: invokedById,
    });
  } catch (err) {
    console.error('[checks-text-integrity] TEXT_INTEGRITY_PERSIST_PDF enqueue failed', {
      checkServiceRunId,
      workVersionId,
      err,
    });
  }
}
