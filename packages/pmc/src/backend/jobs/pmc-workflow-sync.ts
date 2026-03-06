import type { Context, CreateJob } from '@curvenote/scms-core';
import { jobs, getPrismaClient, SlackEventType } from '@curvenote/scms-server';
import { ActivityType, JobStatus } from '@curvenote/scms-db';
import type { Prisma } from '@curvenote/scms-db';
import { fetchRecordsByManuscriptIds } from '../airtable-config.server.js';
import { formatDate } from '@curvenote/common';
import { uuidv7 } from 'uuidv7';
import { PMC_STATE_NAMES } from '../../workflows.js';
import { plural } from 'myst-common';
// PMC metadata types are used for documentation but not directly in the code
// since we're using Prisma.JsonValue for database compatibility

// Job type
export const PMC_WORKFLOW_SYNC = 'PMC_WORKFLOW_SYNC';

const JOB_TIMEOUT = 5; // minutes
const CANCELLATION_CHECK_INTERVAL = 20;

export type AirtableRecord = {
  fields: Record<string, any>;
};

export type SubmissionVersion = {
  id: string;
  status: string;
  metadata: Prisma.JsonValue;
  work_version: {
    id: string;
    title: string;
    metadata: Prisma.JsonValue;
  };
};

export type ActivityStub = {
  activity_type: ActivityType;
  status: string;
  date_created?: string;
};

// WorkVersionMetadata type is now imported from PMC metadata schema

type JobResults = {
  startTime: string;
  endTime?: string;
  totalSubmissions?: number;
  modifiedCount: number;
  unmodifiedCount: number;
  errorCount: number;
  modifiedSubmissions: Array<{ id: string; title: string }>;
  errors: Array<{ submissionId?: string; error: string; title?: string }>;
};

const PMC_STATE_ORDER = [
  PMC_STATE_NAMES.DRAFT,
  PMC_STATE_NAMES.PENDING,
  PMC_STATE_NAMES.NO_ACTION_NEEDED,
  PMC_STATE_NAMES.DEPOSITED,
  PMC_STATE_NAMES.DEPOSIT_FAILED,
  PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
  PMC_STATE_NAMES.DEPOSIT_REJECTED_BY_PMC,
  PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
  PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL,
  PMC_STATE_NAMES.NIHMS_CONVERSION_COMPLETE,
  PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL,
  PMC_STATE_NAMES.AVAILABLE_ON_PMC,
  PMC_STATE_NAMES.WITHDRAWN_FROM_PMC,
  PMC_STATE_NAMES.FAILED,
  PMC_STATE_NAMES.CANCELLED,
  PMC_STATE_NAMES.REMOVED_FROM_PROCESSING,
  PMC_STATE_NAMES.REQUEST_NEW_VERSION,
];

/**
 * When the submission's current status is in this list, the Airtable sync will not update
 * the submission status (status update is skipped). Metadata and activity updates still apply.
 */
export const PMC_STATUSES_THAT_DO_NOT_CHANGE_ON_SYNC: readonly string[] = [
  PMC_STATE_NAMES.NO_ACTION_NEEDED,
  PMC_STATE_NAMES.REQUEST_NEW_VERSION,
  PMC_STATE_NAMES.CANCELLED,
  PMC_STATE_NAMES.FAILED,
];

/**
 * Returns whether the submission status should be updated during sync.
 * When current status is in PMC_STATUSES_THAT_DO_NOT_CHANGE_ON_SYNC, we do not overwrite it.
 */
export function shouldUpdateStatusOnSync(currentStatus: string, resolvedStatus: string): boolean {
  return (
    resolvedStatus !== currentStatus &&
    !PMC_STATUSES_THAT_DO_NOT_CHANGE_ON_SYNC.includes(currentStatus)
  );
}

// Placeholder mapping for milestoneType to PMC_STATE_NAME
const PMC_DATE_FIELD_LOOKUP: Record<string, string> = {
  'initial-approval-date': PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
  'tagging-completion-date': PMC_STATE_NAMES.NIHMS_CONVERSION_COMPLETE,
  'final-approval-date': PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL,
  // Unused dates available in Airtable:
  // 'article-publication-date': '',
  // 'ship-to-pmc-date': '',
  // 'pubmed-date': '',
  // 'pmc-publish-date': '',
};

const PMC_STATUS_LOOKUP: Record<string, string> = {
  "Reviewer's Initial Approval Requested": PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
  "Submitter's Initial Approval or Designation of Reviewer Requested":
    PMC_STATE_NAMES.DEPOSIT_CONFIRMED_BY_PMC,
  "Submitter's Action Requested Following Reviewer's Rejection of Initial Submission":
    PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL,
  "NIHMS Revision of PMC Documents Following Reviewer's Rejection":
    PMC_STATE_NAMES.REVIEWER_REJECTED_INITIAL,
  "Submitter's Files(s) Requested": PMC_STATE_NAMES.REMOVED_FROM_PROCESSING,
  'NIHMS Submission Review and File Preparation': PMC_STATE_NAMES.REVIEWER_APPROVED_INITIAL,
  "Reviewer's Final Approval Requested": PMC_STATE_NAMES.NIHMS_CONVERSION_COMPLETE,
  'NIHMS Conversion to PMC Documents': PMC_STATE_NAMES.REVIEWER_APPROVED_FINAL,
  'Manuscript Removed from Processing': PMC_STATE_NAMES.REMOVED_FROM_PROCESSING,
  'Available in PMC': PMC_STATE_NAMES.AVAILABLE_ON_PMC,
  'Withdrawn from PMC': PMC_STATE_NAMES.WITHDRAWN_FROM_PMC,
  // What do all these statuses correspond to?
  // 'Pending Final Citation Data': '',
  // 'NLM Verification of Journal Information': '',
  // "Reviewer's Approval of the Submission Statement Requested": '',
  // "Submitter's File(s) Requested": '',
  // "Submitter's Action Requested Prior to File Upload": '',
};

/**
 * Resolves the current status for a submission version based on Airtable data
 *
 * Ideally, the airtable 'current-status' field corresponds to a known submission status.
 * If this status is new, this function also returns a new activity entry for the status change.
 *
 * If we cannot use 'current-status' we compare the current submission status with the implicit statuses
 * from the date fields and PMCID, and determine if there is a new status from
 */
export function resolveSubmissionStatus(
  submissionVersion: SubmissionVersion,
  airtableRecord: AirtableRecord,
  activities: ActivityStub[],
): string {
  const fields = airtableRecord.fields || {};
  const currentStatus = submissionVersion.status;

  const airtableCurrentStatus = fields['current-status'];
  // Ideally, we can use the airtable current-status field to determine the new status.
  if (airtableCurrentStatus && PMC_STATUS_LOOKUP[airtableCurrentStatus]) {
    const newStatus = PMC_STATUS_LOOKUP[airtableCurrentStatus];
    if (newStatus !== currentStatus && !activities.some((a) => a.status === newStatus)) {
      activities.push({
        activity_type: ActivityType.SUBMISSION_VERSION_STATUS_CHANGE,
        status: newStatus,
      });
    }
    return newStatus;
  }

  // If we cannot use current-status, determine latest status from date fields and PMCID
  const implicitStatuses = new Set<string>();
  Object.entries(PMC_DATE_FIELD_LOOKUP).forEach(([dateField, status]) => {
    if (fields[dateField]) implicitStatuses.add(status);
  });
  // Note: PMCID field is no longer used for status determination

  // Start with the current submission status
  let newStatus = currentStatus;
  let newStatusIndex = PMC_STATE_ORDER.indexOf(newStatus);
  for (const status of implicitStatuses) {
    const statusIndex = PMC_STATE_ORDER.indexOf(status);
    if (statusIndex > newStatusIndex) {
      newStatus = status;
      newStatusIndex = statusIndex;
    }
  }
  return newStatus;
}

/**
 * Return updated submission version metadata with PMID and PMCID from Airtable
 *
 * An activity entry is created for the status change if the PMCID is new.
 * If there are no updates to the metadata, return null.
 */
export function metadataFromAirtableIdFields(
  submissionVersion: SubmissionVersion,
  airtableRecord: AirtableRecord,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activities: ActivityStub[],
): { pmid?: string; pmcid?: string } | null {
  const fields = airtableRecord.fields || {};
  const currentMetadata = submissionVersion.metadata;
  const pmid = fields.PMID;
  const pmcid = fields.PMCID;

  // Type guard to ensure metadata is an object with pmc property
  if (!currentMetadata || typeof currentMetadata !== 'object' || currentMetadata === null) {
    return null;
  }

  const metadata = currentMetadata as Record<string, any>;

  // Ensure pmc object exists in submission version metadata
  if (!metadata.pmc) metadata.pmc = {};

  let metadataUpdated = false;
  const updates: { pmid?: string; pmcid?: string } = {};

  // Update pmid if it exists in Airtable and is different from current value
  if (pmid && metadata.pmc.pmid !== pmid) {
    updates.pmid = pmid;
    metadataUpdated = true;
  }

  // Update pmcid if it exists in Airtable and is different from current value
  if (pmcid && metadata.pmc.pmcid !== pmcid) {
    // Note: PMCID assignment no longer creates a status change activity
    updates.pmcid = pmcid;
    metadataUpdated = true;
  }

  if (!metadataUpdated) return null;
  return updates;
}

/**
 * Return a list of activity entries corresponding to date fields in Airtable
 */
export function activitiesFromAirtableDateFields(airtableRecord: AirtableRecord): ActivityStub[] {
  const fields = airtableRecord.fields || {};
  const airtableDates = Object.entries(PMC_DATE_FIELD_LOOKUP)
    .map(([milestoneKey, status]) => {
      const date = fields[milestoneKey];
      return date ? { date, status } : null;
    })
    .filter(Boolean) as { date: any; status: string }[];

  const activities: ActivityStub[] = airtableDates.map(({ status, date }) => {
    return {
      activity_type: ActivityType.SUBMISSION_VERSION_STATUS_CHANGE,
      status,
      date_created: String(date),
    };
  });
  return activities;
}

/**
 * Extracts manuscript ID from submission version metadata
 */
export function extractManuscriptId(submissionVersion: SubmissionVersion): string | undefined {
  const metadata = submissionVersion.metadata;

  // Type guard to ensure metadata is an object with pmc property
  if (!metadata || typeof metadata !== 'object' || metadata === null) {
    return undefined;
  }

  const typedMetadata = metadata as Record<string, any>;

  if (typedMetadata.pmc?.emailProcessing?.manuscriptId) {
    return typedMetadata.pmc.emailProcessing.manuscriptId;
  }

  return undefined;
}

/**
 * Finds any PMC Airtable update job older than 5 minutes with status RUNNING and marks them as FAILED
 */
export async function invalidateOldRunningJobs(): Promise<void> {
  const prisma = await getPrismaClient();
  try {
    const fiveMinutesAgo = new Date(Date.now() - JOB_TIMEOUT * 60 * 1000).toISOString();
    const oldJobs = await prisma.job.findMany({
      where: {
        job_type: PMC_WORKFLOW_SYNC,
        status: JobStatus.RUNNING,
        date_created: {
          lt: fiveMinutesAgo,
        },
      },
    });
    if (oldJobs.length > 0) {
      console.log(`Found ${plural('%s old running job(s)', oldJobs.length)}, marking as failed`);
      for (const oldJob of oldJobs) {
        await jobs.dbUpdateJob(oldJob.id, {
          status: JobStatus.FAILED,
          message: 'Job timed out',
          results: {
            ...(oldJob.results as JobResults),
            endTime: formatDate(),
          } as JobResults,
        });
      }
    }
  } catch (err: any) {
    console.log('Error invalidating old running jobs', err);
  }
}

/**
 * Checks if a job has been cancelled by querying the database
 * Since JobStatus doesn't have CANCELLED, we check for a cancellation message
 */
export async function isJobCancelled(jobId: string): Promise<boolean> {
  const prisma = await getPrismaClient();
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  return job?.status === JobStatus.CANCELLED;
}

/**
 * Throws an error if the job has been cancelled
 */
export async function checkJobCancellation(jobId: string): Promise<void> {
  if (await isJobCancelled(jobId)) {
    throw new Error('cancelled');
  }
}

/**
 * Logs memory usage for monitoring during long-running jobs
 */
function logMemoryUsage(stage: string) {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

  console.log(`${stage} - Memory: ${heapUsedMB}MB used, ${heapTotalMB}MB total`);

  // Warn if approaching limits (3GB for 4GB limit)
  if (heapUsedMB > 3000) {
    console.warn('⚠️ High memory usage detected');
  }
}

export async function pmcWorkflowSyncHandler(ctx: Context, data: CreateJob) {
  const prisma = await getPrismaClient();
  const startTime = formatDate();

  const PROGRESS_UPDATE_INTERVAL = 50; // Update progress every 500 submissions

  let totalSubmissions: number | undefined;
  let modifiedCount = 0;
  let unmodifiedCount = 0;
  let errorCount = 0;
  const modifiedSubmissions: Array<{ id: string; title: string } & any> = [];
  const errors: Array<{ submissionId?: string; error: string; title?: string }> = [];
  let job;

  // Invalidate old running jobs
  await invalidateOldRunningJobs();

  try {
    job = await jobs.dbCreateJob({
      ...data,
      status: JobStatus.RUNNING,
      message: 'Finding submissions to update from Airtable',
    });

    await checkJobCancellation(job.id);

    // Fetch all PMC submissions for the site
    const siteId = data.payload?.site_id;
    if (!siteId) throw new Error('Site ID not found in job payload');
    const submissions = await prisma.submission.findMany({
      where: { site: { id: siteId } },
      include: {
        versions: {
          orderBy: { date_created: 'desc' },
          include: { work_version: true },
          take: 1,
        },
        activity: true,
      },
    });

    // Simulate long-running job for testing cancellation
    await checkJobCancellation(job.id);

    // Extract all manuscript IDs from submissions; ignore if they have no version or no manuscript ID
    const manuscriptIds = submissions
      .map((submission) => {
        const version = submission.versions?.[0];
        return version ? extractManuscriptId(version) : undefined;
      })
      .filter((manuscriptId): manuscriptId is string => !!manuscriptId);
    totalSubmissions = manuscriptIds.length;

    await jobs.dbUpdateJob(job.id, {
      status: JobStatus.RUNNING,
      message: `Fetching ${plural('%s record(s)', totalSubmissions)} from Airtable`,
    });

    // Fetch all records from Airtable
    const airtableRecords = await fetchRecordsByManuscriptIds(manuscriptIds);
    console.log(`Retrieved ${plural('%s record(s)', airtableRecords.size)} from Airtable`);
    logMemoryUsage('After Airtable fetch');

    await checkJobCancellation(job.id);

    await jobs.dbUpdateJob(job.id, {
      status: JobStatus.RUNNING,
      message: `Processing ${plural('%s submission(s)', totalSubmissions)}`,
    });

    for (let i = 0; i < submissions.length; i++) {
      const submission = submissions[i];

      // Check for cancellation every CANCELLATION_CHECK_INTERVAL submissions
      if (i % CANCELLATION_CHECK_INTERVAL === 0 && i > 0) {
        await checkJobCancellation(job.id);
      }

      // Update progress every 500 submissions
      if (i % PROGRESS_UPDATE_INTERVAL === 0 && i > 0) {
        logMemoryUsage(`Memory check at ${i} submissions`);
      }

      try {
        const latestVersion = submission.versions?.[0];
        if (!latestVersion) {
          errorCount++;
          errors.push({
            submissionId: submission.id,
            error: 'Submission has no versions; cannot sync from Airtable',
          });
          continue;
        }
        const manuscriptId = extractManuscriptId(latestVersion);
        if (!manuscriptId) continue;
        const submissionTitle = latestVersion.work_version.title || 'Untitled';
        const airtableRecord = airtableRecords.get(manuscriptId);
        if (!airtableRecord) {
          console.log(`No Airtable record found for manuscript ID: ${manuscriptId}`);
          unmodifiedCount++;
          continue;
        }

        // First, get activity entries from the Airtable date fields
        const activities = activitiesFromAirtableDateFields(airtableRecord);

        // Next, handle the PMID and PMCID fields
        const metadataUpdates = metadataFromAirtableIdFields(
          latestVersion,
          airtableRecord,
          activities,
        );

        // Finally, resolve the current submission status
        const status = resolveSubmissionStatus(latestVersion, airtableRecord, activities);

        // Get all new activities for this submission of the correct type by comparing to existing activities
        const newActivities: ActivityStub[] = [];
        for (const activity of activities) {
          if (!activity.date_created) {
            newActivities.push(activity);
          } else {
            const existingActivity = await prisma.activity.findFirst({
              where: {
                submission_id: submission.id,
                activity_type: ActivityType.SUBMISSION_VERSION_STATUS_CHANGE,
                status: activity.status,
                date_created: activity.date_created,
              },
            });
            if (!existingActivity) newActivities.push(activity);
          }
        }

        const dateCreated = formatDate();
        const shouldUpdateStatus = shouldUpdateStatusOnSync(latestVersion.status, status);
        if (shouldUpdateStatus || metadataUpdates || newActivities.length > 0) {
          console.log('Updating submission', submission.id);
          console.log('shouldUpdateStatus', shouldUpdateStatus);
          console.log(
            'Update by user',
            ctx.user.id ?? ctx.$config?.api?.submissionsServiceAccount?.id ?? 'undefined',
          );
          await prisma.$transaction(async (tx) => {
            if (shouldUpdateStatus) {
              await tx.submissionVersion.update({
                where: { id: latestVersion.id },
                data: { status, date_modified: new Date().toISOString() },
              });
            }

            if (metadataUpdates) {
              // Update submission version metadata with PMID/PMCID
              const currentMetadata = (latestVersion.metadata as any) || {};
              const updatedMetadata = {
                ...currentMetadata,
                pmc: {
                  ...(currentMetadata.pmc || {}),
                  ...metadataUpdates,
                },
              };

              await tx.submissionVersion.update({
                where: { id: latestVersion.id },
                data: { metadata: updatedMetadata, date_modified: new Date().toISOString() },
              });
            }

            for (const activity of newActivities) {
              await tx.activity.create({
                data: {
                  id: uuidv7(),
                  submission_id: submission.id,
                  submission_version_id: latestVersion.id,
                  activity_type: ActivityType.SUBMISSION_VERSION_STATUS_CHANGE,
                  status: activity.status,
                  date_created: activity.date_created || dateCreated,
                  date_modified: activity.date_created || dateCreated,
                  activity_by_id:
                    ctx.user.id ?? ctx.$config?.api?.submissionsServiceAccount?.id ?? undefined,
                },
              });
            }
          });
          if (shouldUpdateStatus) {
            const site = await prisma.site.findUnique({
              where: { id: siteId },
            });
            await ctx.sendSlackNotification({
              eventType: SlackEventType.SUBMISSION_STATUS_CHANGED,
              message: `Submission status changed to ${status}`,
              user: { id: ctx.user?.id },
              metadata: {
                status,
                site: site?.name,
                submissionId: submission.id,
                submissionVersionId: latestVersion.id,
              },
            });
          }
          modifiedSubmissions.push({
            id: submission.id,
            title: submissionTitle,
            shouldUpdateStatus,
            metadataUpdates,
            newActivities,
          });
          modifiedCount++;
        } else {
          unmodifiedCount++;
        }

        await jobs.dbUpdateJob(job.id, {
          status: JobStatus.RUNNING,
          results: {
            startTime,
            totalSubmissions,
            modifiedCount,
            unmodifiedCount,
            errorCount,
            modifiedSubmissions,
            errors,
          } as JobResults,
        });
      } catch (err: any) {
        console.log(err);
        errorCount++;
        const title = submission.versions?.[0]?.work_version?.title ?? undefined;
        errors.push({
          submissionId: submission.id,
          error: err.message || String(err),
          ...(title && { title }),
        });
      }
    }

    logMemoryUsage('At Job Complete');
    await jobs.dbUpdateJob(job.id, {
      status: JobStatus.COMPLETED,
      message: `All submissions processed`,
      results: {
        startTime,
        endTime: formatDate(),
        totalSubmissions,
        modifiedCount,
        unmodifiedCount,
        errorCount,
        modifiedSubmissions,
        errors,
      } as JobResults,
    });
  } catch (err: any) {
    if (job) {
      if (err.message !== 'cancelled') {
        await jobs.dbUpdateJob(job.id, {
          status: JobStatus.FAILED,
          message: `Job failed`,
          results: {
            startTime,
            endTime: formatDate(),
            totalSubmissions,
            modifiedCount,
            unmodifiedCount,
            errorCount,
            modifiedSubmissions,
            errors: errors.concat({ error: err.message || String(err) }),
          } as JobResults,
        });
        return jobs.formatJobDTO(ctx, { ...job, status: JobStatus.FAILED });
      }
    } else {
      throw err;
    }
  }

  const finalJob = await prisma.job.findUnique({ where: { id: job.id } });
  return jobs.formatJobDTO(ctx, finalJob!);
}
