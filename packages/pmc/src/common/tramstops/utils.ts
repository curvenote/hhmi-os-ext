import { getPrismaClient } from '@curvenote/scms-server';
import { ActivityType } from '@prisma/client';

/**
 * Gets all status change activities for a submission version, ordered by creation date.
 * @param submissionVersionId - The submission version ID
 * @returns Array of activities with status and date
 */
export async function getActivitiesForSubmissionVersion(
  submissionVersionId: string,
): Promise<Array<{ status: string; date: string }>> {
  const prisma = await getPrismaClient();

  // Query all status change activities for this submission version
  const activities = await prisma.activity.findMany({
    where: {
      submission_version_id: submissionVersionId,
      activity_type: {
        in: [ActivityType.SUBMISSION_VERSION_STATUS_CHANGE, ActivityType.NEW_SUBMISSION],
      },
      status: {
        not: null,
      },
    },
    select: {
      status: true,
      date_created: true,
    },
    orderBy: {
      date_created: 'asc',
    },
  });

  return activities.map((activity) => ({
    status: activity.status!,
    date: activity.date_created,
  }));
}
