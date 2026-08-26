import type { Context, ExtensionAdminActionHandler } from '@curvenote/scms-core';
import { getPrismaClient, safeObjectDataUpdate } from '@curvenote/scms-server';
import { coerceToObject } from '@curvenote/scms-core';
import { formatDate } from '@curvenote/common';
import type { Prisma } from '@curvenote/scms-db';
import { uuidv7 as uuid } from 'uuidv7';
import type { ProofigConfigOverlay } from '../server/config.server.js';
import { PROOFIG_CONFIG_OBJECT_TYPE } from '../server/config.server.js';
import { loadProofigFailedRunsPage } from './loadFailedRuns.server.js';
import {
  retryProofigCheckRun,
  retryProofigFailedRunsBulk,
} from '../server/retryCheckRun.server.js';

type ProofigConfigData = ProofigConfigOverlay;

async function getOrCreateProofigConfigObjectId(): Promise<string> {
  const prisma = await getPrismaClient();
  const existing = await prisma.object.findFirst({
    where: { type: PROOFIG_CONFIG_OBJECT_TYPE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const id = uuid();
  const now = formatDate();
  await prisma.object.create({
    data: {
      id,
      type: PROOFIG_CONFIG_OBJECT_TYPE,
      date_created: now,
      date_modified: now,
      data: {},
      occ: 0,
    },
    select: { id: true },
  });
  return id;
}

async function updateProofigConfigField(
  field: keyof ProofigConfigData,
  value: string,
): Promise<{ success: true } | { error: { type: string; message: string } }> {
  try {
    const objectId = await getOrCreateProofigConfigObjectId();
    await safeObjectDataUpdate<ProofigConfigData & Prisma.JsonObject>(objectId, (current) => {
      const base = coerceToObject(current) as ProofigConfigData;
      return { ...base, [field]: value } as ProofigConfigData & Prisma.JsonObject;
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save';
    return { error: { type: 'general', message } };
  }
}

function parseRunIdsFromFormData(formData: FormData): string[] {
  return formData
    .getAll('runIds')
    .map((v) => v.toString().trim())
    .filter(Boolean);
}

export function getExtensionAdminActionHandlers(): ExtensionAdminActionHandler[] {
  return [
    {
      name: 'proofig-set-baseurl',
      handler: async (_ctx: Context, formData: FormData) => {
        const value = (formData.get('value') ?? '').toString().trim();
        return updateProofigConfigField('apiBaseUrl', value);
      },
    },
    {
      name: 'proofig-set-client-id',
      handler: async (_ctx: Context, formData: FormData) => {
        const value = (formData.get('value') ?? '').toString().trim();
        return updateProofigConfigField('clientId', value);
      },
    },
    {
      name: 'proofig-set-client-secret',
      handler: async (_ctx: Context, formData: FormData) => {
        const value = (formData.get('value') ?? '').toString();
        return updateProofigConfigField('clientSecret', value);
      },
    },
    {
      name: 'proofig-set-maintenance',
      handler: async (ctx: Context, formData: FormData) => {
        try {
          const enabled = formData.get('enabled') === 'true';
          const message = (formData.get('message') ?? '').toString().trim();
          const objectId = await getOrCreateProofigConfigObjectId();
          await safeObjectDataUpdate<ProofigConfigData & Prisma.JsonObject>(objectId, (current) => {
            const base = coerceToObject(current) as ProofigConfigData;
            if (enabled) {
              return {
                ...base,
                maintenance: {
                  enabled: true,
                  ...(message ? { message } : {}),
                  updatedAt: new Date().toISOString(),
                  ...(ctx.user?.id ? { updatedByUserId: ctx.user.id } : {}),
                },
              } as ProofigConfigData & Prisma.JsonObject;
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { maintenance: _omit, ...rest } = base;
            return rest as ProofigConfigData & Prisma.JsonObject;
          });
          return { success: true };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to save maintenance settings';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'proofig-list-failed-runs',
      handler: async (_ctx: Context, formData: FormData) => {
        try {
          const page = Number(formData.get('page') ?? 1);
          const pageSize = Number(formData.get('pageSize') ?? 20);
          const result = await loadProofigFailedRunsPage({ page, pageSize });
          return { success: true, ...result };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load failed runs';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'proofig-retry-failed-run',
      handler: async (ctx: Context, formData: FormData) => {
        const runIds = parseRunIdsFromFormData(formData);
        const runId = runIds[0];
        if (!runId) {
          return { error: { type: 'validation', message: 'runIds is required' } };
        }
        try {
          const prisma = await getPrismaClient();
          const sourceRun = await prisma.checkServiceRun.findFirst({
            where: { id: runId, kind: 'proofig' },
          });
          if (!sourceRun) {
            return { error: { type: 'general', message: 'Check run not found' } };
          }
          const outcome = await retryProofigCheckRun(
            ctx,
            sourceRun.work_version_id,
            runId,
            'admin',
          );
          if ('success' in outcome && outcome.success) {
            return {
              success: true,
              results: [
                {
                  runId,
                  ok: true,
                  checkRunId: (outcome as { checkRunId?: string }).checkRunId,
                },
              ],
            };
          }
          return {
            success: true,
            results: [{ runId, ok: false, message: outcome.error?.message ?? 'Retry failed' }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Retry failed';
          return { error: { type: 'general', message } };
        }
      },
    },
    {
      name: 'proofig-retry-failed-runs-bulk',
      handler: async (ctx: Context, formData: FormData) => {
        const runIds = parseRunIdsFromFormData(formData);
        if (runIds.length === 0) {
          return { error: { type: 'validation', message: 'Select at least one run to retry' } };
        }
        try {
          const { results } = await retryProofigFailedRunsBulk(ctx, runIds);
          return { success: true, results };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Bulk retry failed';
          return { error: { type: 'general', message } };
        }
      },
    },
  ];
}
