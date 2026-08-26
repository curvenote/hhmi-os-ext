import type { SecureContext } from '@curvenote/scms-server';
import { getPrismaClient, signFilesInMetadata } from '@curvenote/scms-server';

export type SignedFile = { name: string; signedUrl: string };

export type CheckServiceRunWithVersion = {
  id: string;
  kind: string;
  date_created: string;
  date_modified: string;
  data: unknown;
  work_version_id: string;
  created_by_id: string | null;
  work_version: {
    id: string;
    title: string;
    work_id: string;
    authors?: string[];
    metadata?: unknown;
    work?: { cdn: string | null } | null;
  };
  signedFiles?: SignedFile[];
};

const PROOFIG_KIND = 'proofig';
const DEFAULT_LIMIT = 100;

const DOC_PDF_EXT = /\.(docx?|pdf)$/i;

function isDocOrPdf(nameOrPath: string): boolean {
  return DOC_PDF_EXT.test(nameOrPath);
}

export async function loadProofigCheckServiceRuns(
  ctx: SecureContext,
  limit: number = DEFAULT_LIMIT,
): Promise<CheckServiceRunWithVersion[]> {
  const prisma = await getPrismaClient();
  const rows = await prisma.checkServiceRun.findMany({
    where: { kind: PROOFIG_KIND, created_by_id: ctx.user.id },
    orderBy: { date_modified: 'desc' },
    take: limit,
    select: {
      id: true,
      kind: true,
      date_created: true,
      date_modified: true,
      data: true,
      work_version_id: true,
      created_by_id: true,
      work_version: {
        include: {
          work: true,
        },
      },
    },
  });

  const runs: CheckServiceRunWithVersion[] = await Promise.all(
    rows.map(async (row) => {
      const run = row as unknown as CheckServiceRunWithVersion;
      const meta = run.work_version?.metadata as Record<string, unknown> | null | undefined;
      const cdn = run.work_version?.work?.cdn ?? '';
      let signedFiles: SignedFile[] = [];

      if (meta && typeof meta === 'object' && meta.files && typeof meta.files === 'object' && cdn) {
        const withVersion = { version: 1, ...meta };
        try {
          const signed = await signFilesInMetadata(
            withVersion as Parameters<typeof signFilesInMetadata>[0],
            cdn,
            ctx,
          );
          const files = signed?.files ?? {};
          signedFiles = Object.values(files)
            .filter((f) => f?.signedUrl && (f.name || f.path) && isDocOrPdf(f.name ?? f.path ?? ''))
            .map((f) => ({
              name: f.name ?? f.path ?? 'file',
              signedUrl: f.signedUrl as string,
            }));
        } catch (err) {
          console.warn('Could not sign files for run', run.id, err);
        }
      }

      return {
        ...run,
        work_version: {
          id: run.work_version.id,
          title: run.work_version.title,
          work_id: run.work_version.work_id,
        },
        signedFiles,
      };
    }),
  );

  return runs;
}
