import type { PrismaClient } from '@curvenote/scms-db';
import type { CheckMaintenanceRecord } from '@curvenote/scms-core';

/**
 * Object table type for Proofig config overrides.
 * When an entry with this type exists, its data.apiBaseUrl, data.clientId, and data.clientSecret
 * are merged over the extension's app config.
 */
export const PROOFIG_CONFIG_OBJECT_TYPE = 'extension:proofig:config';

/** Overlay shape stored in Object.data for type extension:proofig:config. */
export interface ProofigConfigOverlay {
  apiBaseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  maintenance?: CheckMaintenanceRecord;
}

const OVERLAY_KEYS: (keyof ProofigConfigOverlay)[] = [
  'apiBaseUrl',
  'clientId',
  'clientSecret',
  'maintenance',
];

function parseOverlay(data: unknown): Partial<ProofigConfigOverlay> {
  if (data == null || typeof data !== 'object') return {};
  const raw = data as Record<string, unknown>;
  const overlay: Partial<ProofigConfigOverlay> = {};
  for (const key of OVERLAY_KEYS) {
    if (key === 'maintenance') {
      if (
        raw.maintenance != null &&
        typeof raw.maintenance === 'object' &&
        !Array.isArray(raw.maintenance)
      ) {
        const m = raw.maintenance as Record<string, unknown>;
        overlay.maintenance = {
          enabled: m.enabled === true,
          ...(typeof m.message === 'string' && m.message.trim() !== ''
            ? { message: m.message.trim() }
            : {}),
          ...(typeof m.updatedAt === 'string' ? { updatedAt: m.updatedAt } : {}),
          ...(typeof m.updatedByUserId === 'string' ? { updatedByUserId: m.updatedByUserId } : {}),
        };
      }
      continue;
    }
    const v = raw[key];
    if (typeof v === 'string') overlay[key] = v;
  }
  return overlay;
}

/**
 * Returns base config with optional overrides from the Object table.
 * Loads the first Object row with type PROOFIG_CONFIG_OBJECT_TYPE (by date_modified desc)
 * and merges data.apiBaseUrl, data.clientId, data.clientSecret onto the base config.
 * Only overlay keys that are defined (string) are applied.
 */
export async function getProofigConfigWithOverrides(
  baseConfig: Record<string, unknown>,
  prisma: PrismaClient,
): Promise<Record<string, unknown>> {
  const row = await prisma.object.findFirst({
    where: { type: PROOFIG_CONFIG_OBJECT_TYPE },
    orderBy: { date_modified: 'desc' },
    select: { data: true },
  });
  if (!row?.data) return { ...baseConfig };
  const overlay = parseOverlay(row.data);
  return { ...baseConfig, ...overlay };
}
