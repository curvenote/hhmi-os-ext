/**
 * HHMI compliance Airtable cache using the shared Object table.
 * - Webhook always upserts when it runs.
 * - Routes: read from cache; if object missing (cold start), may fetch and write once; if exists, never update.
 */

import { getPrismaClient } from '@curvenote/scms-server';
import type { NormalizedScientist } from './types.js';
import type { NormalizedJournal } from './airtable.journals.server.js';
import { fetchAllScientists } from './airtable.scientists.server.js';
import { fetchAllJournals } from './airtable.journals.server.js';

const HHMI_COMPLIANCE_CACHE_PREFIX = 'hhmi:compliance:';

/** Cache slot definitions. Add new entries here when caching additional queries. */
export const CACHE_KEYS = {
  scientists: {
    id: `${HHMI_COMPLIANCE_CACHE_PREFIX}scientists`,
    type: `${HHMI_COMPLIANCE_CACHE_PREFIX}scientists`,
  },
  journals: {
    id: `${HHMI_COMPLIANCE_CACHE_PREFIX}journals`,
    type: `${HHMI_COMPLIANCE_CACHE_PREFIX}journals`,
  },
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Read a cached object by id. Returns the row or null.
 */
export async function getCached(
  id: string,
): Promise<{ data: unknown; date_modified: string } | null> {
  const prisma = await getPrismaClient();
  const row = await prisma.object.findUnique({
    where: { id },
    select: { data: true, date_modified: true },
  });
  if (!row) return null;
  return { data: row.data, date_modified: row.date_modified };
}

/**
 * Upsert a cache row. Used by webhook (always) and by routes on cold start only.
 */
export async function setCached(id: string, type: string, data: unknown): Promise<void> {
  const prisma = await getPrismaClient();
  const now = nowIso();
  await prisma.object.upsert({
    where: { id },
    create: {
      id,
      type,
      date_created: now,
      date_modified: now,
      data: data as object,
      occ: 0,
    },
    update: {
      date_modified: now,
      data: data as object,
    },
  });
}

/**
 * Read scientists list from cache. Returns null if not present.
 */
export async function getScientistsFromCache(): Promise<NormalizedScientist[] | null> {
  const row = await getCached(CACHE_KEYS.scientists.id);
  if (!row || row.data == null) return null;
  const parsed = row.data as NormalizedScientist[];
  return Array.isArray(parsed) ? parsed : null;
}

/**
 * Get scientists from cache, or fetch from Airtable and write to cache once (cold start).
 * Routes use this; they may write only when the object does not exist.
 */
export async function getScientistsFromCacheOrFetch(): Promise<NormalizedScientist[]> {
  const cached = await getScientistsFromCache();
  if (cached !== null) return cached;

  const scientists = await fetchAllScientists();
  const prisma = await getPrismaClient();
  const existing = await prisma.object.findUnique({
    where: { id: CACHE_KEYS.scientists.id },
    select: { id: true },
  });
  if (!existing) {
    await setCached(CACHE_KEYS.scientists.id, CACHE_KEYS.scientists.type, scientists);
  }
  return scientists;
}

/**
 * Read journals list from cache. Returns null if not present.
 */
export async function getJournalsFromCache(): Promise<NormalizedJournal[] | null> {
  const row = await getCached(CACHE_KEYS.journals.id);
  if (!row || row.data == null) return null;
  const parsed = row.data as NormalizedJournal[];
  return Array.isArray(parsed) ? parsed : null;
}

/**
 * Get journals from cache, or fetch from Airtable and write to cache once (cold start).
 */
export async function getJournalsFromCacheOrFetch(): Promise<NormalizedJournal[]> {
  const cached = await getJournalsFromCache();
  if (cached !== null) return cached;

  const journals = await fetchAllJournals();
  const prisma = await getPrismaClient();
  const existing = await prisma.object.findUnique({
    where: { id: CACHE_KEYS.journals.id },
    select: { id: true },
  });
  if (!existing) {
    await setCached(CACHE_KEYS.journals.id, CACHE_KEYS.journals.type, journals);
  }
  return journals;
}
