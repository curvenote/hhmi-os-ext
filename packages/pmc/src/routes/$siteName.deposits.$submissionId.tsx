import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { site } from '@curvenote/scms-core';
import { getPrismaClient } from '@curvenote/scms-server';
import { withAppPMCContext } from '../backend/context.server.js';

/**
 * Redirects /app/sites/pmc/deposits/:submissionId to the latest submission version
 * for that submission. If no version exists, redirects to the PMC inbox.
 */
export const loader = async (args: LoaderFunctionArgs) => {
  const ctx = await withAppPMCContext(args, [site.submissions.read]);

  if (!ctx.$config.app.extensions?.pmc) {
    throw redirect('/app/works');
  }

  const submissionId = args.params.submissionId!;

  const prisma = await getPrismaClient();
  const latestVersion = await prisma.submissionVersion.findFirst({
    where: {
      submission: {
        id: submissionId,
        site: { name: 'pmc' },
      },
    },
    orderBy: { date_created: 'desc' },
    select: { id: true },
  });

  if (!latestVersion) {
    throw redirect('/app/sites/pmc/inbox');
  }

  throw redirect(`/app/sites/pmc/deposits/${submissionId}/v/${latestVersion.id}`);
};
