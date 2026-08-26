import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { error405, httpError } from '@curvenote/scms-core';
import { getConfig, getPrismaClient, verifyHandshakeToken } from '@curvenote/scms-server';
import { z } from 'zod';
import { patchProofigRunServiceData } from '../../server/checkRunColumns.server.js';
import { enqueueProofigPersistPdfFollowUpIfNeeded } from '../../server/enqueue-proofig-persist-pdf.server.js';
import { PROOFIG_PERSIST_PDF } from '../../server/jobs/proofigPersistPdf.constants.js';
import {
  buildProofigReportFileEntry,
  proofigReportStoragePath,
  replaceGeneratedProofigReport,
} from '../../proofigReportFiles.js';

const PdfStoredBodySchema = z.object({
  work_version_id: z.string().min(1),
  report_id: z.string().optional(),
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  md5: z.string().min(1),
});

const PersistPdfJobPayloadSchema = z.object({
  work_version_id: z.string().min(1),
  check_service_run_id: z.string().min(1),
  report_id: z.string().min(1).optional(),
});

/** GET is not supported; the hook is POST-only. */
export function loader(_args: LoaderFunctionArgs) {
  throw error405();
}

/**
 * Registration hook called by the proofig-pdf-service Cloud Run worker after it uploads a
 * rendered report PDF. Authenticated with the handshake token minted for the render job
 * (same token used for the job callback). Records the file on the check run `serviceData.files`.
 *
 * The token must be a PROOFIG_PERSIST_PDF job handshake whose payload targets this check run;
 * the registered path must match the expected `{cdn_key}/generated/{checkRunId}/proofig-report.pdf`.
 *
 * After registration, if `reportId` advanced while this job was in flight, enqueues a follow-up
 * persist for the current report (excluding this still-RUNNING job from the in-flight check).
 */
export async function action(args: ActionFunctionArgs) {
  const id = args.params.id;
  if (!id) {
    throw httpError(400, 'Missing check service run id');
  }

  const authHeader = args.request.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw httpError(401, 'Missing handshake token');
  }
  const config = await getConfig();
  let claims: ReturnType<typeof verifyHandshakeToken>;
  try {
    claims = verifyHandshakeToken(
      token,
      config.api.handshakeIssuer,
      config.api.handshakeSigningSecret,
    );
  } catch {
    throw httpError(401, 'Invalid handshake token');
  }

  if (claims.aud !== PROOFIG_PERSIST_PDF) {
    throw httpError(401, 'Handshake audience mismatch');
  }
  if (!claims.jobId?.trim()) {
    throw httpError(401, 'Handshake missing jobId');
  }

  let json: unknown;
  try {
    json = await args.request.json();
  } catch {
    throw httpError(400, 'Invalid JSON body');
  }
  const parsed = PdfStoredBodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const prisma = await getPrismaClient();
  const [job, run, workVersion] = await Promise.all([
    prisma.job.findUnique({
      where: { id: claims.jobId },
      select: { id: true, job_type: true, payload: true },
    }),
    prisma.checkServiceRun.findUnique({
      where: { id },
      select: { id: true, work_version_id: true },
    }),
    prisma.workVersion.findUnique({
      where: { id: body.work_version_id },
      select: { id: true, cdn_key: true },
    }),
  ]);

  if (!job || job.job_type !== PROOFIG_PERSIST_PDF) {
    throw httpError(401, 'Handshake job is not a Proofig PDF persist job');
  }

  const jobPayload = PersistPdfJobPayloadSchema.safeParse(job.payload);
  if (!jobPayload.success) {
    throw httpError(401, 'Handshake job payload is invalid');
  }
  if (jobPayload.data.check_service_run_id !== id) {
    throw httpError(403, 'Handshake job is not bound to this check run');
  }
  if (jobPayload.data.work_version_id !== body.work_version_id) {
    throw httpError(403, 'work_version_id does not match handshake job');
  }

  if (!run) {
    throw httpError(404, 'Check run not found');
  }
  if (run.work_version_id !== body.work_version_id) {
    throw httpError(403, 'work_version_id does not match check run');
  }

  if (!workVersion?.cdn_key?.trim()) {
    throw httpError(422, 'Work version has no cdn_key');
  }
  const expectedPath = proofigReportStoragePath(workVersion.cdn_key, id);
  // Must match the absolute key returned by scms-tasks `uploadSingleFileToCdn`
  // (`${cdnKey}/${relativeStoragePath}`), not the worker's relative `storagePath`.
  if (body.path !== expectedPath) {
    throw httpError(403, 'Registered path does not match expected report PDF location');
  }

  const uploadDate = new Date().toISOString();
  const fileEntry = buildProofigReportFileEntry(body.path, body.size, body.md5, uploadDate);
  if (jobPayload.data.report_id && body.report_id && jobPayload.data.report_id !== body.report_id) {
    throw httpError(403, 'report_id does not match handshake job');
  }
  const storedReportId = jobPayload.data.report_id ?? body.report_id;

  await patchProofigRunServiceData(id, (sd) =>
    replaceGeneratedProofigReport(sd, fileEntry, storedReportId),
  );

  // If reportId advanced while this render was in flight, kick off a persist for the new id.
  try {
    await enqueueProofigPersistPdfFollowUpIfNeeded(id, {
      excludeJobId: claims.jobId,
      jobReportId: storedReportId,
    });
  } catch (err) {
    console.error('[proofig] follow-up persist enqueue after pdf-stored failed', {
      checkServiceRunId: id,
      jobId: claims.jobId,
      err,
    });
  }

  return Response.json({ ok: true }, { status: 200 });
}
