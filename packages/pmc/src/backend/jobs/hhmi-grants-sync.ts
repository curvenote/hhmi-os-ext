import type { Context, CreateJob } from '@curvenote/scms-core';
import { getPrismaClient, jobs } from '@curvenote/scms-server';
import { JobStatus, type Prisma } from '@curvenote/scms-db';
import { formatDate } from '@curvenote/common';
import {
  getAirtableApiKey,
  getAirtableBaseId,
  getAirtableScientistsTableId,
  getAirtableScientistsViewId,
  getAirtableScientistsGrantIdFieldId,
  getAirtableScientistsOrcidFieldId,
  getAirtableScientistsFullNameFieldId,
  getAirtableScientistsFirstNamePreferredFieldId,
  getAirtableScientistsFirstNamePrimaryFieldId,
  getAirtableScientistsLastNamePreferredFieldId,
  getAirtableScientistsEmailFieldId,
} from '../airtable-config.server.js';
import { updateHHMIScientists, type HHMIScientist } from '../hhmi-grants.server.js';
import { plural } from 'myst-common';
import { parseSyncStrategy, type FundingSyncStrategy } from '../../common/grants-sync-strategy.js';

// Job type constant
export const HHMI_GRANTS_SYNC = 'HHMI_GRANTS_SYNC';

const JOB_TIMEOUT = 5; // minutes
export const HHMI_GRANTS_SYNC_TIMEOUT_MS = JOB_TIMEOUT * 60 * 1000;
const AIRTABLE_PAGE_SIZE = 100; // Airtable's maximum page size

// ==============================
// Type Definitions
// ==============================

export interface HHMIGrantsSyncJobPayload {
  site_id: string;
  sync_type: 'hhmi-scientists';
  sync_strategy?: 'merge' | 'replace';
  /** @deprecated Compatibility for jobs queued before sync_strategy was introduced. */
  syncStrategy?: 'merge' | 'replace';
}

export interface AirtableScientistRecord {
  id: string;
  fields: {
    [key: string]: any;
  };
}

export interface AirtableResponse {
  records: AirtableScientistRecord[];
  offset?: string; // For pagination
}

export interface JobResults {
  startTime: string;
  endTime?: string;
  totalRecords?: number;
  processedCount: number;
  validCount: number;
  skippedCount: number;
  errorCount: number;
  errors: Array<{ recordId?: string; error: string }>;
  syncStrategy: 'merge' | 'replace';
}

// ==============================
// Airtable Integration
// ==============================

/**
 * Fetch all scientists from Airtable with pagination support
 */
async function fetchAllScientists(): Promise<AirtableScientistRecord[]> {
  const apiKey = await getAirtableApiKey();
  const baseId = await getAirtableBaseId();
  const tableId = await getAirtableScientistsTableId();
  const viewId = await getAirtableScientistsViewId();

  // Debug logging
  console.log('🔍 Airtable Sync Debug Info:');
  console.log('- API Key exists:', !!apiKey, 'Length:', apiKey?.length);
  console.log('- Base ID:', baseId);
  console.log('- Table ID:', tableId);
  console.log('- View ID:', viewId || 'Not specified (using all records)');
  console.log('- Full URL:', `https://api.airtable.com/v0/${baseId}/${tableId}`);

  const baseUrl = `https://api.airtable.com/v0/${baseId}/${tableId}`;
  const allRecords: AirtableScientistRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(baseUrl);
    url.searchParams.set('pageSize', AIRTABLE_PAGE_SIZE.toString());
    url.searchParams.set('returnFieldsByFieldId', 'true');
    if (viewId) {
      url.searchParams.set('view', viewId);
    }
    if (offset) {
      url.searchParams.set('offset', offset);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Airtable API Error Details:');
      console.error('- Status:', response.status, response.statusText);
      console.error('- Headers:', Object.fromEntries(response.headers.entries()));
      console.error('- Error Data:', errorData);
      console.error('- Request URL:', url.toString());

      throw new Error(
        errorData.error?.message || `Airtable API error: ${response.status} ${response.statusText}`,
      );
    }

    const data: AirtableResponse = await response.json();
    allRecords.push(...data.records);
    offset = data.offset;

    console.log(
      `Fetched ${data.records.length} records from Airtable (total: ${allRecords.length})`,
    );
  } while (offset);

  return allRecords;
}

interface ScientistFieldIds {
  grantId: string;
  orcid: string;
  fullName: string;
  firstNamePreferred: string;
  firstNamePrimary: string;
  lastNamePreferred: string;
  email: string;
}

async function getScientistFieldIds(): Promise<ScientistFieldIds> {
  const [grantId, orcid, fullName, firstNamePreferred, firstNamePrimary, lastNamePreferred, email] =
    await Promise.all([
      getAirtableScientistsGrantIdFieldId(),
      getAirtableScientistsOrcidFieldId(),
      getAirtableScientistsFullNameFieldId(),
      getAirtableScientistsFirstNamePreferredFieldId(),
      getAirtableScientistsFirstNamePrimaryFieldId(),
      getAirtableScientistsLastNamePreferredFieldId(),
      getAirtableScientistsEmailFieldId(),
    ]);

  return {
    grantId,
    orcid,
    fullName,
    firstNamePreferred,
    firstNamePrimary,
    lastNamePreferred,
    email,
  };
}

/**
 * Transform Airtable record to HhmiScientist
 */
function transformAirtableRecord(
  record: AirtableScientistRecord,
  fieldIds: ScientistFieldIds,
): HHMIScientist | null {
  const grantId = record.fields[fieldIds.grantId];
  const fullName = record.fields[fieldIds.fullName];
  const orcid = record.fields[fieldIds.orcid] || '';
  const firstNamePreferred = record.fields[fieldIds.firstNamePreferred];
  const firstNamePrimary = record.fields[fieldIds.firstNamePrimary];
  const lastNamePreferred = record.fields[fieldIds.lastNamePreferred] || '';
  const email = record.fields[fieldIds.email] || '';

  // Skip records with missing essential data
  if (!grantId || !fullName) {
    console.log(
      `Skipped record ${record.id}: missing grantId (${!!grantId}) or fullName (${!!fullName})`,
    );
    return null;
  }

  const firstNamePreferredTrimmed =
    firstNamePreferred != null ? String(firstNamePreferred).trim() : '';
  const firstNamePrimaryTrimmed = firstNamePrimary != null ? String(firstNamePrimary).trim() : '';
  const firstName = firstNamePreferredTrimmed || firstNamePrimaryTrimmed;

  // Use original Airtable ID as string to preserve precision
  const scientistId = record.id;

  return {
    id: scientistId,
    fullName: String(fullName).trim(),
    firstName,
    lastName: String(lastNamePreferred).trim(),
    email: String(email).trim(),
    grantId: String(grantId).trim(),
    orcid: String(orcid).trim(),
  };
}

// ==============================
// Job Processing
// ==============================

function siteScopedJobWhere(jobId: string, siteId: string) {
  return {
    id: jobId,
    job_type: HHMI_GRANTS_SYNC,
    payload: {
      path: ['site_id'],
      equals: siteId,
    },
  };
}

function isTerminalHhmiSyncStatus(status: string) {
  return (
    status === JobStatus.COMPLETED || status === JobStatus.FAILED || status === JobStatus.CANCELLED
  );
}

async function getHhmiSyncJob(jobId: string, siteId: string) {
  const prisma = await getPrismaClient();
  return prisma.job.findFirst({
    where: siteScopedJobWhere(jobId, siteId),
  });
}

/**
 * Progress updates only apply while the job is still QUEUED/RUNNING.
 * If the stale-job reaper terminalizes the row first, `count` is 0 and callers must stop.
 *
 * Residual window: after a successful progress update (including during
 * `updateHHMIScientists`) the reaper can still mark the row FAILED before COMPLETED
 * terminalize. Funding data may already be written while the returned job status is FAILED.
 */
async function updateRunningHhmiSyncJobProgress(jobId: string, siteId: string, message: string) {
  const prisma = await getPrismaClient();
  const result = await prisma.job.updateMany({
    where: {
      ...siteScopedJobWhere(jobId, siteId),
      status: {
        in: [JobStatus.QUEUED, JobStatus.RUNNING],
      },
    },
    data: {
      date_modified: formatDate(),
      status: JobStatus.RUNNING,
      messages: { push: message },
    },
  });
  if (result.count > 0) return { count: result.count };
  const job = await getHhmiSyncJob(jobId, siteId);
  return { count: result.count, job };
}

function formatStoppedHhmiSyncProgress(
  ctx: Context,
  jobId: string,
  progress: Awaited<ReturnType<typeof updateRunningHhmiSyncJobProgress>>,
) {
  if (!progress.job) {
    throw new Error(`HHMI grants sync job ${jobId} not found`);
  }
  return jobs.formatJobDTO(ctx, progress.job);
}

export async function conditionallyTerminalizeHhmiSyncJob(
  jobId: string,
  siteId: string,
  update: {
    status: (typeof JobStatus)['COMPLETED'] | (typeof JobStatus)['FAILED'];
    message: string;
    results: Prisma.InputJsonValue;
  },
  options: {
    includeJob?: boolean;
    modifiedBefore?: string;
  } = {},
) {
  const prisma = await getPrismaClient();
  const result = await prisma.job.updateMany({
    where: {
      ...siteScopedJobWhere(jobId, siteId),
      status: {
        in: [JobStatus.QUEUED, JobStatus.RUNNING],
      },
      ...(options.modifiedBefore
        ? {
            date_modified: {
              lt: options.modifiedBefore,
            },
          }
        : {}),
    },
    data: {
      date_modified: formatDate(),
      status: update.status,
      results: update.results,
      messages: { push: update.message },
    },
  });
  if (!options.includeJob) return { count: result.count };
  const job = await getHhmiSyncJob(jobId, siteId);
  return { count: result.count, job };
}

/**
 * Main job handler for HHMI scientists sync
 */
export async function hhmiGrantsSyncHandler(ctx: Context, data: CreateJob) {
  const startTime = formatDate();
  const payload = data.payload as unknown as HHMIGrantsSyncJobPayload;
  const siteId = payload?.site_id;
  if (typeof siteId !== 'string' || !siteId) {
    throw new Error('HHMI grants sync job site_id is required');
  }
  let syncStrategy: FundingSyncStrategy = 'merge';

  let totalRecords: number | undefined;
  let processedCount = 0;
  let validCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors: Array<{ recordId?: string; error: string }> = [];
  let completedJob;

  const existingJob = await getHhmiSyncJob(data.id, siteId);
  if (!existingJob) {
    throw new Error(`HHMI grants sync job ${data.id} not found`);
  }
  if (isTerminalHhmiSyncStatus(existingJob.status)) {
    console.log(`Skipping HHMI grants sync job ${data.id}: status is ${existingJob.status}`);
    return jobs.formatJobDTO(ctx, existingJob);
  }
  const job = existingJob;

  try {
    const parsedSyncStrategy = parseSyncStrategy(payload.sync_strategy ?? payload.syncStrategy);
    if (!parsedSyncStrategy) throw new Error('Invalid sync strategy');
    syncStrategy = parsedSyncStrategy;

    console.log(`Starting HHMI grants sync job ${job.id}`);

    const fetching = await updateRunningHhmiSyncJobProgress(
      job.id,
      siteId,
      'Fetching funding identifiers from Airtable',
    );
    if (fetching.count === 0) return formatStoppedHhmiSyncProgress(ctx, job.id, fetching);

    // Fetch all scientists from Airtable
    const airtableRecords = await fetchAllScientists();
    totalRecords = airtableRecords.length;

    console.log(`Retrieved ${plural('%s record(s)', totalRecords)} from Airtable`);

    const processing = await updateRunningHhmiSyncJobProgress(
      job.id,
      siteId,
      `Processing ${plural('%s record(s)', totalRecords)} from Airtable`,
    );
    if (processing.count === 0) return formatStoppedHhmiSyncProgress(ctx, job.id, processing);

    // Transform and validate records
    const scientists: HHMIScientist[] = [];
    const fieldIds = await getScientistFieldIds();

    for (const record of airtableRecords) {
      processedCount++;

      try {
        const scientist = transformAirtableRecord(record, fieldIds);

        if (scientist) {
          scientists.push(scientist);
          validCount++;
        } else {
          skippedCount++;
          console.log(`❌ Skipped record ${record.id}: missing essential data`);
        }
      } catch (err: any) {
        errorCount++;
        const errorMsg = err.message || String(err);
        errors.push({ recordId: record.id, error: errorMsg });
        console.error(`❌ Error processing record ${record.id}:`, errorMsg);
      }
    }

    console.log(
      `📊 Processing Summary: ${validCount} valid, ${skippedCount} skipped, ${errorCount} errors`,
    );

    if (syncStrategy === 'replace' && validCount === 0) {
      throw new Error('Refusing to replace all funding data with an empty result set');
    }

    const updating = await updateRunningHhmiSyncJobProgress(
      job.id,
      siteId,
      `Updating funding identifiers with ${plural('%s valid record(s)', validCount)}`,
    );
    if (updating.count === 0) return formatStoppedHhmiSyncProgress(ctx, job.id, updating);

    // Update the scientists data in the database
    console.log(
      `🔄 Updating database with ${scientists.length} scientists using ${syncStrategy} strategy...`,
    );
    await updateHHMIScientists(scientists, syncStrategy);
    console.log(`✅ Database update completed`);

    console.log(`Successfully synced ${validCount} HHMI grants`);

    const completion = await conditionallyTerminalizeHhmiSyncJob(
      job.id,
      siteId,
      {
        status: JobStatus.COMPLETED,
        message: `Funding Id sync completed successfully`,
        results: {
          startTime,
          endTime: formatDate(),
          totalRecords,
          processedCount,
          validCount,
          skippedCount,
          errorCount,
          errors,
          syncStrategy,
        } satisfies JobResults,
      },
      { includeJob: true },
    );
    completedJob = completion.job;
  } catch (err: any) {
    console.error('HHMI scientists sync job failed:', err);

    const failure = await conditionallyTerminalizeHhmiSyncJob(
      job.id,
      siteId,
      {
        status: JobStatus.FAILED,
        message: `Funding Id sync failed: ${err.message}`,
        results: {
          startTime,
          endTime: formatDate(),
          totalRecords,
          processedCount,
          validCount,
          skippedCount,
          errorCount,
          errors: errors.concat({ error: err.message || String(err) }),
          syncStrategy,
        } satisfies JobResults,
      },
      { includeJob: true },
    );
    if (!failure.job) throw new Error(`HHMI grants sync job ${job.id} not found`);
    return jobs.formatJobDTO(ctx, failure.job);
  }
  if (!completedJob) throw new Error(`HHMI grants sync job ${job.id} not found`);
  return jobs.formatJobDTO(ctx, completedJob);
}

// ==============================
// Utility Functions
// ==============================

export function isHhmiSyncJobStale(job: { status: string; date_modified: string }): boolean {
  const isActive = job.status === JobStatus.QUEUED || job.status === JobStatus.RUNNING;
  return isActive && Date.parse(job.date_modified) < Date.now() - HHMI_GRANTS_SYNC_TIMEOUT_MS;
}

/**
 * Check if there are any stale queued/running HHMI sync jobs for a site and mark them as failed
 */
export async function invalidateOldHhmiSyncJobs(siteId: string): Promise<void> {
  const prisma = await getPrismaClient();

  try {
    const timeoutAgo = new Date(Date.now() - HHMI_GRANTS_SYNC_TIMEOUT_MS).toISOString();

    const oldJobs = await prisma.job.findMany({
      where: {
        job_type: HHMI_GRANTS_SYNC,
        status: {
          in: [JobStatus.QUEUED, JobStatus.RUNNING],
        },
        payload: {
          path: ['site_id'],
          equals: siteId,
        },
        date_modified: {
          lt: timeoutAgo,
        },
      },
    });

    if (oldJobs.length > 0) {
      console.log(`Found ${plural('%s old HHMI sync job(s)', oldJobs.length)}, marking as failed`);

      for (const oldJob of oldJobs) {
        await conditionallyTerminalizeHhmiSyncJob(
          oldJob.id,
          siteId,
          {
            status: JobStatus.FAILED,
            message: 'Job timed out',
            results: {
              ...(oldJob.results as unknown as JobResults),
              endTime: formatDate(),
            } satisfies JobResults,
          },
          { modifiedBefore: timeoutAgo },
        );
      }
    }
  } catch (err: any) {
    console.error('Error invalidating old HHMI sync jobs:', err);
  }
}
