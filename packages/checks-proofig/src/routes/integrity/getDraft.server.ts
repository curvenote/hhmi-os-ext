import type { SecureContext } from '@curvenote/scms-server';
import {
  getPrismaClient,
  dbCreateDraftFileWork,
  findWorkByVersion,
  signFilesInMetadata,
} from '@curvenote/scms-server';
import { WorkContents } from '@curvenote/scms-core';

export type GetDraftResult =
  | {
      success: true;
      workId: string;
      workVersionId: string;
      cdnKey: string;
      title: string;
      metadata: unknown;
    }
  | { success: false; error: string };

function hasChecksInMetadata(metadata: unknown): boolean {
  const m = metadata as Record<string, unknown> | null;
  return Boolean(m && typeof m === 'object' && 'checks' in m);
}

/**
 * Returns the most recent existing draft (single-version, with checks metadata) for the user,
 * or creates a new one. Caller can then use WorkFileUpload with
 * action=/app/works/:workId/upload/:workVersionId so stage/complete/remove are handled by the upload route.
 */
export async function getDraftForManuscriptChecks(ctx: SecureContext): Promise<GetDraftResult> {
  if (!ctx.user?.id) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const prisma = await getPrismaClient();
    const draftWorks = await prisma.work.findMany({
      where: {
        work_users: { some: { user_id: ctx.user.id } },
        contains: { has: WorkContents.FILES },
        versions: { some: { draft: true } },
      },
      include: {
        versions: { orderBy: { date_created: 'desc' } },
      },
      orderBy: { date_modified: 'desc' },
    });

    const singleVersionDrafts = draftWorks.filter(
      (w) => w.versions.length === 1 && w.versions[0].draft === true,
    );
    const validDraft = singleVersionDrafts.find((w) => hasChecksInMetadata(w.versions[0].metadata));
    const existing = validDraft ?? null;

    let workId: string;
    let workVersionId: string;

    if (existing) {
      workId = existing.id;
      workVersionId = existing.versions[0].id;
    } else {
      const displayName = ctx.user.display_name?.trim();
      const initialAuthors = displayName ? [displayName] : [];
      const newWork = await dbCreateDraftFileWork(ctx, 'manuscript-checks', initialAuthors);
      workId = newWork.id;
      workVersionId = newWork.versions[0].id;
    }

    const work = await findWorkByVersion(workVersionId);
    if (!work) {
      return { success: false, error: 'Work not found' };
    }

    const rawMetadata = (work.metadata as Record<string, unknown>) || {};
    const signedMetadata = await signFilesInMetadata(
      { version: 1, ...rawMetadata },
      work.cdn ?? '',
      ctx,
    );

    return {
      success: true,
      workId,
      workVersionId,
      cdnKey: work.cdn_key ?? '',
      title: work.title ?? '',
      metadata: signedMetadata,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get or create draft';
    return { success: false, error: message };
  }
}
