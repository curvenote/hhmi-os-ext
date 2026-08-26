import { getPrismaClient } from '@curvenote/scms-server';
import {
  type ExtensionCheckHandleActionArgs,
  type ExtensionCheckHandleActionResult,
  type ExtensionCheckStatusArgs,
  checkMaintenanceActionError,
  maintenanceGuardFromConfig,
} from '@curvenote/scms-core';
import {
  ALL_PENDING_STAGES,
  proofigDataSchema,
  isProofigAwaitingSubimageApprovalInUi,
  type ProofigDataSchema,
  type ProofigStages,
} from '../schema.js';
import { applyDocumentPreparationFromConverterJob } from './applyDocumentPreparationFromConverterJob.server.js';
import { getProofigConfigWithOverrides } from './config.server.js';
import { resolveChecksAnalyticsTriggerFromArgs } from '@hhmi/checks-shared/analytics/trigger.server';
import { postProofigRemoteStatus } from './proofigRemoteStatus.server.js';
import { applyNotifyPayloadToCheckRun } from './applyNotifyPayloadToCheckRun.server.js';
import { getProofingToken } from './proofigAuth.server.js';
import { proofigReportUrlWithAccessToken } from './proofigReportUrl.server.js';
import { checkRunCoarseStatus } from './checkRunColumns.server.js';
import { retryProofigCheckRun } from './retryCheckRun.server.js';
import { startProofigCheckRun } from './startCheckRun.server.js';
import { guardProofigWorkCheckScopes, PROOFIG_DISPATCH_INTENTS } from './checkWorkScopes.server.js';
import { handleRegenerateProofigPdfAction } from './regenerateProofigPdf.server.js';

async function findProofigRunForWorkVersion(
  workVersionId: string,
  explicitCheckRunId: string | null | undefined,
) {
  const prisma = await getPrismaClient();
  if (explicitCheckRunId?.trim()) {
    return prisma.checkServiceRun.findFirst({
      where: {
        id: explicitCheckRunId.trim(),
        work_version_id: workVersionId,
        kind: 'proofig',
      },
    });
  }
  return prisma.checkServiceRun.findFirst({
    where: { work_version_id: workVersionId, kind: 'proofig' },
    orderBy: { date_modified: 'desc' },
  });
}

function reportIdFromRunData(runData: unknown): string | undefined {
  if (runData == null || typeof runData !== 'object') return undefined;
  const serviceData = (runData as { serviceData?: unknown }).serviceData;
  const parsed = proofigDataSchema.safeParse(serviceData);
  return parsed.success ? parsed.data.reportId : undefined;
}

function proofigStagesFromRunRowData(runData: unknown): ProofigStages {
  if (runData == null || typeof runData !== 'object') return ALL_PENDING_STAGES;
  const serviceData = (runData as { serviceData?: unknown }).serviceData;
  const parsed = proofigDataSchema.safeParse(serviceData);
  if (!parsed.success) return ALL_PENDING_STAGES;
  return { ...ALL_PENDING_STAGES, ...parsed.data.stages };
}

type ProofigRemoteStatusFetchResult =
  | { ok: true; runId: string; body: unknown }
  | { ok: false; result: ExtensionCheckHandleActionResult };

/**
 * Shared: find run, load config, POST Proofig /api/status with a fresh token.
 */
async function fetchProofigRemoteStatusPayload(
  ctx: NonNullable<ExtensionCheckHandleActionArgs['ctx']>,
  workVersionId: string,
  checkRunIdField: string | undefined,
): Promise<ProofigRemoteStatusFetchResult> {
  const prisma = await getPrismaClient();
  const run = await findProofigRunForWorkVersion(workVersionId, checkRunIdField);
  if (!run) {
    return {
      ok: false,
      result: {
        error: { type: 'general', message: 'No Proofig check run found for this work version.' },
        status: 404,
      },
    };
  }
  const reportId = reportIdFromRunData(run.data);
  if (!reportId?.trim()) {
    return {
      ok: false,
      result: {
        error: {
          type: 'general',
          message:
            'This run has no Proofig report_id yet. Wait until the submission to Proofig has completed.',
        },
        status: 400,
      },
    };
  }
  const base =
    (ctx.$config.app?.extensions?.['checks-proofig'] as Record<string, unknown> | undefined) ?? {};
  const mergedConfig = await getProofigConfigWithOverrides(base, prisma);
  const apiBaseUrl =
    (mergedConfig.apiBaseUrl as string | undefined)?.trim() ||
    process.env.PROOFIG_API_BASE_URL?.trim();
  if (!apiBaseUrl) {
    return {
      ok: false,
      result: {
        error: { type: 'general', message: 'checks-proofig apiBaseUrl is not configured.' },
        status: 500,
      },
    };
  }
  const statusResult = await postProofigRemoteStatus(apiBaseUrl, mergedConfig, reportId.trim());
  if (!statusResult.ok) {
    return {
      ok: false,
      result: {
        error: { type: 'general', message: statusResult.message },
        status:
          statusResult.statusCode && statusResult.statusCode >= 400 ? statusResult.statusCode : 502,
      },
    };
  }
  return { ok: true, runId: run.id, body: statusResult.body };
}

async function applyProofigRemoteStatusRefresh(
  ctx: NonNullable<ExtensionCheckHandleActionArgs['ctx']>,
  workVersionId: string,
  checkRunIdField: string | undefined,
): Promise<ExtensionCheckHandleActionResult> {
  const fetched = await fetchProofigRemoteStatusPayload(ctx, workVersionId, checkRunIdField);
  if (!fetched.ok) return fetched.result;
  const receivedAt = new Date().toISOString();
  const applyResult = await applyNotifyPayloadToCheckRun(fetched.runId, fetched.body, receivedAt);
  if (!applyResult.ok) {
    const msg =
      applyResult.kind === 'persist'
        ? applyResult.message
        : applyResult.issues.map((i) => i.message).join('; ');
    return {
      error: { type: 'general', message: msg },
      status: 400,
    };
  }
  return { success: true };
}

// Define the checks metadata section type (matches app schema)
export interface ChecksMetadataSection {
  checks?: {
    enabled?: string[];
    proofig?: ProofigDataSchema;
    'curvenote-structure'?: { dispatched: boolean };
    textIntegrity?: { dispatched: boolean };
  };
}

// NOTE: kept for reference in case we need richer metadata handling in future.
// type WorkVersionMetadataWithChecks = WorkVersionMetadata & {
//   checks?: ChecksMetadataSection['checks'];
// };

// Intents that trigger outbound calls to Proofig and must be blocked during maintenance.
const OUTBOUND_INTENTS = PROOFIG_DISPATCH_INTENTS;

/**
 * Handle Proofig check actions.
 *
 * Both upload flow and checks page use the same intent, 'execute', to enqueue
 * the Proofig submit job.
 */
export async function handleProofigAction(
  args: ExtensionCheckHandleActionArgs,
): Promise<ExtensionCheckHandleActionResult> {
  const { intent, workVersionId } = args;
  const scopeGate = await guardProofigWorkCheckScopes(args.ctx, workVersionId, intent);
  if (!scopeGate.ok) return scopeGate.result;
  const ctx = args.ctx;
  if (!ctx) {
    return { error: { type: 'general', message: 'Authentication required' }, status: 401 };
  }

  if (OUTBOUND_INTENTS.has(intent)) {
    const prisma = await getPrismaClient();
    const base =
      (ctx.$config.app?.extensions?.['checks-proofig'] as Record<string, unknown> | undefined) ??
      {};
    const mergedConfig = await getProofigConfigWithOverrides(base, prisma);
    const maintenanceBlock = maintenanceGuardFromConfig(mergedConfig);
    if (maintenanceBlock) {
      return checkMaintenanceActionError(maintenanceBlock.error?.message);
    }
  }

  // ----- Execute path: upload flow or checks page with job creation -----
  if (intent === 'execute' && ctx) {
    if (!workVersionId) {
      return {
        error: {
          type: 'general',
          message: 'Work version ID is required for Proofig execute',
        },
        status: 400,
      };
    }

    const result = await startProofigCheckRun(ctx, workVersionId, {
      trigger: resolveChecksAnalyticsTriggerFromArgs(args, 'checks_page'),
    });
    if (!result.ok) {
      return {
        error: { type: 'general', message: result.message },
        status: result.status,
      };
    }
    return { success: true };
  }

  if (intent === 'retry' && ctx) {
    if (!workVersionId) {
      return {
        error: { type: 'general', message: 'Work version ID is required for Proofig retry' },
        status: 400,
      };
    }
    const checkRunId = args.formData?.get('checkRunId')?.toString()?.trim();
    if (!checkRunId) {
      return { error: { type: 'general', message: 'checkRunId is required' }, status: 400 };
    }
    return retryProofigCheckRun(ctx, workVersionId, checkRunId, 'user', {
      trigger: resolveChecksAnalyticsTriggerFromArgs(args, 'retry'),
    });
  }

  // ----- Sync documentPreparation from CONVERTER_TASK job status (DOCX uploads) -----
  if (intent === 'hydrate-document-preparation-status') {
    if (!ctx) {
      return {
        error: {
          type: 'general',
          message: 'Proofig hydrate-document-preparation-status requires a signed-in context',
        },
        status: 401,
      };
    }
    if (!workVersionId) {
      return {
        error: { type: 'general', message: 'Work version ID is required' },
        status: 400,
      };
    }
    const checkRunIdField = args.formData?.get('checkRunId')?.toString()?.trim();
    if (!checkRunIdField) {
      return {
        error: { type: 'general', message: 'checkRunId is required' },
        status: 400,
      };
    }
    const run = await findProofigRunForWorkVersion(workVersionId, checkRunIdField);
    if (!run) {
      return {
        error: { type: 'general', message: 'No Proofig check run found for this work version.' },
        status: 404,
      };
    }
    const applyResult = await applyDocumentPreparationFromConverterJob(run.id);
    if (!applyResult.ok) {
      return {
        error: { type: 'general', message: applyResult.message },
        status: 400,
      };
    }
    return { success: true, updated: applyResult.updated };
  }

  // ----- POST /api/status at Proofig (manual refresh; same payload shape as notify) -----
  if (intent === 'fetch-remote-status') {
    if (!ctx) {
      return {
        error: {
          type: 'general',
          message: 'Proofig fetch-remote-status requires a signed-in context',
        },
        status: 401,
      };
    }
    if (!workVersionId) {
      return {
        error: { type: 'general', message: 'Work version ID is required' },
        status: 400,
      };
    }
    const checkRunIdField = args.formData?.get('checkRunId')?.toString();
    const fetched = await fetchProofigRemoteStatusPayload(ctx, workVersionId, checkRunIdField);
    if (!fetched.ok) return fetched.result;
    return {
      success: true,
      proofigRemoteStatus: fetched.body,
    } as ExtensionCheckHandleActionResult;
  }

  // ----- Fetch remote status and apply to check run immediately (no preview dialog) -----
  if (intent === 'refresh-remote-status') {
    if (!ctx) {
      return {
        error: {
          type: 'general',
          message: 'Proofig refresh-remote-status requires a signed-in context',
        },
        status: 401,
      };
    }
    if (!workVersionId) {
      return {
        error: { type: 'general', message: 'Work version ID is required' },
        status: 400,
      };
    }
    const checkRunIdField = args.formData?.get('checkRunId')?.toString();
    return applyProofigRemoteStatusRefresh(ctx, workVersionId, checkRunIdField);
  }

  // ----- Fresh access token for opening Proofig UI (read stored report_url; do not persist token) -----
  if (intent === 'refresh-report-url') {
    if (!ctx) {
      return {
        error: {
          type: 'general',
          message: 'Proofig refresh-report-url requires a signed-in context',
        },
        status: 401,
      };
    }
    if (!workVersionId) {
      return {
        error: { type: 'general', message: 'Work version ID is required' },
        status: 400,
      };
    }
    const checkRunIdField = args.formData?.get('checkRunId')?.toString()?.trim();
    if (!checkRunIdField) {
      return {
        error: { type: 'general', message: 'checkRunId is required' },
        status: 400,
      };
    }

    const prisma = await getPrismaClient();
    const base =
      (ctx.$config.app?.extensions?.['checks-proofig'] as Record<string, unknown> | undefined) ??
      {};

    const [run, mergedConfig] = await Promise.all([
      prisma.checkServiceRun.findFirst({
        where: {
          id: checkRunIdField,
          work_version_id: workVersionId,
          kind: 'proofig',
        },
      }),
      getProofigConfigWithOverrides(base, prisma),
    ]);

    if (!run) {
      return {
        error: { type: 'general', message: 'Proofig check run not found for this work version.' },
        status: 404,
      };
    }

    const rowData = run.data as { serviceData?: unknown } | null;
    const parsed = proofigDataSchema.safeParse(rowData?.serviceData);
    const serviceData = parsed.success ? parsed.data : null;
    const storedReportUrl =
      serviceData?.reportUrl?.trim() || serviceData?.summary?.reportUrl?.trim();
    if (!storedReportUrl) {
      return {
        error: {
          type: 'general',
          message: 'No report URL is stored for this run yet.',
        },
        status: 400,
      };
    }
    const apiBaseUrl =
      (mergedConfig.apiBaseUrl as string | undefined)?.trim() ||
      process.env.PROOFIG_API_BASE_URL?.trim();
    if (!apiBaseUrl) {
      return {
        error: {
          type: 'general',
          message: 'checks-proofig apiBaseUrl is not configured.',
        },
        status: 500,
      };
    }

    let token: string;
    try {
      token = await getProofingToken(apiBaseUrl, mergedConfig);
    } catch (e) {
      return {
        error: {
          type: 'general',
          message: e instanceof Error ? e.message : 'Proofig authentication failed',
        },
        status: 502,
      };
    }

    let freshUrl: string;
    try {
      freshUrl = proofigReportUrlWithAccessToken(storedReportUrl, token);
    } catch (e) {
      return {
        error: {
          type: 'general',
          message: e instanceof Error ? e.message : 'Invalid stored report URL',
        },
        status: 400,
      };
    }

    return {
      success: true,
      proofigReportOpenUrl: freshUrl,
    } as ExtensionCheckHandleActionResult & { proofigReportOpenUrl: string };
  }

  /**
   * Work-details load: sync from Proofig /api/status when this run is the latest Proofig run for
   * the version and the pipeline UI is in sub-image approval. No-op otherwise (success).
   */
  if (intent === 'hydrate-subimage-approval-status') {
    if (!ctx) {
      return {
        error: {
          type: 'general',
          message: 'Proofig hydrate-subimage-approval-status requires a signed-in context',
        },
        status: 401,
      };
    }
    if (!workVersionId) {
      return {
        error: { type: 'general', message: 'Work version ID is required' },
        status: 400,
      };
    }
    const checkRunIdField = args.formData?.get('checkRunId')?.toString()?.trim();
    if (!checkRunIdField) {
      return {
        error: { type: 'general', message: 'checkRunId is required' },
        status: 400,
      };
    }
    const prisma = await getPrismaClient();
    const latest = await prisma.checkServiceRun.findFirst({
      where: { work_version_id: workVersionId, kind: 'proofig' },
      orderBy: { date_modified: 'desc' },
      select: { id: true, data: true },
    });
    if (!latest || latest.id !== checkRunIdField) {
      return { success: true };
    }
    const stages = proofigStagesFromRunRowData(latest.data);
    if (!isProofigAwaitingSubimageApprovalInUi(stages)) {
      return { success: true };
    }
    return applyProofigRemoteStatusRefresh(ctx, workVersionId, checkRunIdField);
  }

  // ----- Apply notify-shaped JSON to the check run (same persistence as webhook) -----
  if (intent === 'apply-notify-payload') {
    if (!ctx) {
      return {
        error: {
          type: 'general',
          message: 'Proofig apply-notify-payload requires a signed-in context',
        },
        status: 401,
      };
    }
    if (!workVersionId) {
      return {
        error: { type: 'general', message: 'Work version ID is required' },
        status: 400,
      };
    }
    const rawJson = args.formData?.get('notifyPayloadJson')?.toString();
    if (rawJson == null || !rawJson.trim()) {
      return {
        error: { type: 'general', message: 'notifyPayloadJson is required' },
        status: 400,
      };
    }
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawJson) as unknown;
    } catch {
      return {
        error: { type: 'general', message: 'notifyPayloadJson must be valid JSON' },
        status: 400,
      };
    }
    const checkRunIdField = args.formData?.get('checkRunId')?.toString();
    const run = await findProofigRunForWorkVersion(workVersionId, checkRunIdField);
    if (!run) {
      return {
        error: { type: 'general', message: 'No Proofig check run found for this work version.' },
        status: 404,
      };
    }
    const receivedAt = new Date().toISOString();
    const applyResult = await applyNotifyPayloadToCheckRun(run.id, parsedBody, receivedAt);
    if (!applyResult.ok) {
      const msg =
        applyResult.kind === 'persist'
          ? applyResult.message
          : applyResult.issues.map((i) => i.message).join('; ');
      return {
        error: { type: 'general', message: msg },
        status: 400,
      };
    }
    return { success: true };
  }

  // ----- Regenerate the report PDF (force overwrite the stored PDF) -----
  if (intent === 'regenerate-pdf') {
    return handleRegenerateProofigPdfAction({
      ctx,
      workVersionId,
      formData: args.formData,
    });
  }

  return {
    error: { type: 'general', message: 'Unknown intent' },
    status: 400,
  };
}

/**
 * Stub implementation for check run status. Returns current run data from DB.
 */
export async function proofigStatus(args: ExtensionCheckStatusArgs): Promise<any> {
  const { checkRunId } = args;
  const prisma = await getPrismaClient();
  const run = await prisma.checkServiceRun.findUnique({
    where: { id: checkRunId },
  });
  if (!run) {
    return { status: 'unknown', message: 'Check run not found' };
  }
  const status = checkRunCoarseStatus(run.status);
  const runData = run.data as Record<string, unknown> | null;
  const serviceData = runData?.serviceData;
  return { status, serviceData };
}
