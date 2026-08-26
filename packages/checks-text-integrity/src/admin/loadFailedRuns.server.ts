import { getPrismaClient } from '@curvenote/scms-server';
import { getErrorMessage } from '../serviceDataSchemas.js';

const TEXT_INTEGRITY_KIND = 'checks-text-integrity';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type TextIntegrityFailedRunRow = {
  id: string;
  workVersionId: string;
  workId: string;
  dateCreated: string;
  errorSummary: string;
  submitterId: string | null;
  submitterEmail: string | null;
  submitterName: string | null;
};

export type TextIntegrityFailedRunsPage = {
  runs: TextIntegrityFailedRunRow[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  /** Legacy field; column-indexed queries do not scan. */
  scanLimitReached: boolean;
};

function summarizeTextIntegrityError(data: unknown): string {
  if (data == null || typeof data !== 'object') return 'Unknown error';
  const top = data as Record<string, unknown>;
  const serviceData = top.serviceData;
  if (serviceData != null && typeof serviceData === 'object') {
    const message = getErrorMessage(serviceData as Parameters<typeof getErrorMessage>[0]);
    if (message?.trim()) return message.trim();
  }
  return 'Check failed';
}

type RunWithRelations = Awaited<
  ReturnType<Awaited<ReturnType<typeof getPrismaClient>>['checkServiceRun']['findMany']>
>[number] & {
  work_version: { id: string; work_id: string };
  created_by: { id: string; email: string | null; display_name: string | null } | null;
};

function mapRow(run: RunWithRelations): TextIntegrityFailedRunRow {
  return {
    id: run.id,
    workVersionId: run.work_version_id,
    workId: run.work_version.work_id,
    dateCreated: run.date_created,
    errorSummary: summarizeTextIntegrityError(run.data),
    submitterId: run.created_by_id,
    submitterEmail: run.created_by?.email ?? null,
    submitterName: run.created_by?.display_name ?? null,
  };
}

/** Paginated list of failed Text Integrity runs that have not yet been retried. */
export async function loadTextIntegrityFailedRunsPage(options?: {
  page?: number;
  pageSize?: number;
}): Promise<TextIntegrityFailedRunsPage> {
  const page = Math.max(1, Number(options?.page) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(options?.pageSize) || DEFAULT_PAGE_SIZE),
  );
  const skip = (page - 1) * pageSize;

  const prisma = await getPrismaClient();
  const rows = await prisma.checkServiceRun.findMany({
    where: {
      kind: TEXT_INTEGRITY_KIND,
      status: 'error',
      retried: false,
    },
    orderBy: { date_created: 'desc' },
    skip,
    take: pageSize + 1,
    include: {
      work_version: { select: { id: true, work_id: true } },
      created_by: { select: { id: true, email: true, display_name: true } },
    },
  });

  const hasNextPage = rows.length > pageSize;
  const runs = rows.slice(0, pageSize).map((run) => mapRow(run as RunWithRelations));
  return { runs, page, pageSize, hasNextPage, scanLimitReached: false };
}
