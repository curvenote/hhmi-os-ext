import type { Prisma } from '@curvenote/scms-db';
import type { SiteContext } from '@curvenote/scms-server';
import {
  getPrismaClient,
  activitySubmissionVersionRefSelect,
  activityWorkVersionRefSelect,
  submissionVersionForListSelect,
  siteWorkWorkVersionWithWorkSelect,
} from '@curvenote/scms-server';

/** PMC inbox needs version + work metadata for search and deposit cards. */
export const pmcInboxSubmissionVersionSelect = {
  ...submissionVersionForListSelect,
  metadata: true,
  work_version: {
    select: {
      ...siteWorkWorkVersionWithWorkSelect,
      metadata: true,
    },
  },
} satisfies Prisma.SubmissionVersionSelect;

export type PmcInboxSubmissionVersion = Prisma.SubmissionVersionGetPayload<{
  select: typeof pmcInboxSubmissionVersionSelect;
}>;

export async function dbListPMCSubmissionsWithLatestNonDraftVersion(ctx: SiteContext) {
  const prisma = await getPrismaClient();
  const itemsPromise = prisma.submission.findMany({
    where: {
      AND: [
        { site: { is: { name: ctx.site.name } } },
        { versions: { some: {} } },
        {
          NOT: {
            versions: {
              every: {
                status: 'DRAFT',
              },
            },
          },
        },
        {
          versions: {
            some: {
              NOT: [{ status: 'INCOMPLETE' }],
            },
          },
        },
      ],
    },
    include: {
      kind: true,
      collection: true,
      submitted_by: true,
      slugs: true,
      work: true,
      site: {
        include: {
          submissionKinds: true,
          collections: { orderBy: { date_created: 'desc' } },
          domains: true,
        },
      },
      versions: {
        select: pmcInboxSubmissionVersionSelect,
        orderBy: {
          date_created: 'desc',
        },
      },
      activity: {
        include: {
          activity_by: true,
          kind: true,
          submission_version: { select: activitySubmissionVersionRefSelect },
          work_version: { select: activityWorkVersionRefSelect },
        },
        orderBy: {
          date_created: 'desc',
        },
        take: 1,
      },
    },
    orderBy: [
      {
        date_published: 'desc',
      },
      {
        date_created: 'desc',
      },
    ],
  });

  return itemsPromise
    .then((i) => {
      return i.filter((item) => {
        return !item.versions.every((v) => v.status === 'DRAFT');
      });
    })
    .then((i) =>
      i.map((item) => {
        const latestNonDraftVersion = (item.versions.find((v) => v.status !== 'DRAFT') ??
          item.versions[0]) as PmcInboxSubmissionVersion;

        const hasDraft = item.versions[0].status === 'DRAFT';

        return {
          ...item,
          status: latestNonDraftVersion.status,
          latestNonDraftVersion,
          hasDraft,
        };
      }),
    );
}
