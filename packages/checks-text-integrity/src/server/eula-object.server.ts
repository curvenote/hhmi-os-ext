import { formatDate } from '@curvenote/common';
import { getPrismaClient, safeObjectDataUpdate } from '@curvenote/scms-server';
import type { Prisma, PrismaClient } from '@curvenote/scms-db';
import { uuidv7 as uuid } from 'uuidv7';
import { TEXT_INTEGRITY_ITHEnticate_OBJECT_TYPE } from './config.server.js';

export type CachedEula = {
  version: string;
  url?: string;
  validFrom?: string;
  validUntil?: string | null;
  availableLanguages?: string[];
  html?: string;
  date_fetched: string;
};

export function parseCachedEula(raw: unknown): CachedEula | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const version = typeof o.version === 'string' ? o.version : undefined;
  const date_fetched = typeof o.date_fetched === 'string' ? o.date_fetched : undefined;
  if (!version || !date_fetched) return undefined;
  return {
    version,
    date_fetched,
    url: typeof o.url === 'string' ? o.url : undefined,
    validFrom: typeof o.validFrom === 'string' ? o.validFrom : undefined,
    validUntil:
      o.validUntil === null || typeof o.validUntil === 'string'
        ? (o.validUntil as string | null)
        : undefined,
    availableLanguages: Array.isArray(o.availableLanguages)
      ? (o.availableLanguages as string[])
      : undefined,
    html: typeof o.html === 'string' ? o.html : undefined,
  };
}

async function loadIthenticateObjectRow(prisma: PrismaClient) {
  return prisma.object.findFirst({
    where: { type: TEXT_INTEGRITY_ITHEnticate_OBJECT_TYPE },
    orderBy: { date_modified: 'desc' },
    select: { id: true, data: true },
  });
}

export async function getOrCreateIthenticateObjectId(): Promise<string> {
  const prisma = await getPrismaClient();
  const existing = await prisma.object.findFirst({
    where: { type: TEXT_INTEGRITY_ITHEnticate_OBJECT_TYPE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const id = uuid();
  const now = formatDate();
  await prisma.object.create({
    data: {
      id,
      type: TEXT_INTEGRITY_ITHEnticate_OBJECT_TYPE,
      date_created: now,
      date_modified: now,
      data: {},
      occ: 0,
    },
  });
  return id;
}

/** Loads cached EULA from `extension:text-integrity:ithenticate`. */
export async function loadCachedEula(prisma?: PrismaClient): Promise<CachedEula | undefined> {
  const db = prisma ?? (await getPrismaClient());
  const row = await loadIthenticateObjectRow(db);
  return parseCachedEula(row?.data);
}

/** Persists cached EULA HTML and metadata to the dedicated iThenticate Object row. */
export async function persistCachedEula(eula: CachedEula): Promise<void> {
  const objectId = await getOrCreateIthenticateObjectId();
  await safeObjectDataUpdate(objectId, () => eula as Prisma.JsonObject);
}
