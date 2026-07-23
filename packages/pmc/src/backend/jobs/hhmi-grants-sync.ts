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

async function getTerminalHhmiSyncJob(jobId: string, siteId: string) {
  const prisma = await getPrismaClient();
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      payload: {
        path: ['site_id'],
        equals: siteId,
      },
    },
  });
  if (
    job &&
    (job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.FAILED ||
      job.status === JobStatus.CANCELLED)
  ) {
    return job;
  }
  return null;
}

export async function conditionallyTerminalizeHhmiSyncJob(
  jobId: string,
  siteId: string,
  update: {
    status: (typeof JobStatus)['COMPLETED'] | (typeof JobStatus)['FAILED'];
    message: string;
    results: Prisma.InputJsonValue;
  },
) {
  const prisma = await getPrismaClient();
  await prisma.job.updateMany({
    where: {
      id: jobId,
      payload: {
        path: ['site_id'],
        equals: siteId,
      },
      status: {
        in: [JobStatus.QUEUED, JobStatus.RUNNING],
      },
    },
    data: {
      date_modified: formatDate(),
      status: update.status,
      results: update.results,
      messages: { push: update.message },
    },
  });
  return prisma.job.findFirst({
    where: {
      id: jobId,
      payload: {
        path: ['site_id'],
        equals: siteId,
      },
    },
  });
}

/**
 * Main job handler for HHMI scientists sync
 */
export async function hhmiGrantsSyncHandler(ctx: Context, data: CreateJob) {
  const startTime = formatDate();
  const payload = data.payload as unknown as HHMIGrantsSyncJobPayload;
  const { site_id: siteId } = payload;
  let syncStrategy: FundingSyncStrategy = 'merge';

  let totalRecords: number | undefined;
  let processedCount = 0;
  let validCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors: Array<{ recordId?: string; error: string }> = [];
  let job;

  const terminalJob = await getTerminalHhmiSyncJob(data.id, siteId);
  if (terminalJob) {
    console.log(`Skipping HHMI grants sync job ${data.id}: status is ${terminalJob.status}`);
    return jobs.formatJobDTO(ctx, terminalJob);
  }

  try {
    job = await jobs.dbStartJob({ ...data, status: JobStatus.RUNNING });
    const parsedSyncStrategy = parseSyncStrategy(payload.sync_strategy ?? payload.syncStrategy);
    if (!parsedSyncStrategy) throw new Error('Invalid sync strategy');
    syncStrategy = parsedSyncStrategy;

    await jobs.dbUpdateJob(job.id, {
      status: JobStatus.RUNNING,
      message: 'Starting funding identifiers sync from Airtable',
    });

    console.log(`Starting HHMI grants sync job ${job.id}`);

    // Update job status
    await jobs.dbUpdateJob(job.id, {
      status: JobStatus.RUNNING,
      message: 'Fetching funding identifiers from Airtable',
    });

    // Fetch all scientists from Airtable
    const airtableRecords = await fetchAllScientists();
    totalRecords = airtableRecords.length;

    console.log(`Retrieved ${plural('%s record(s)', totalRecords)} from Airtable`);

    await jobs.dbUpdateJob(job.id, {
      status: JobStatus.RUNNING,
      message: `Processing ${plural('%s record(s)', totalRecords)} from Airtable`,
    });

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

    const terminalJobBeforeUpdate = await getTerminalHhmiSyncJob(job.id, siteId);
    if (terminalJobBeforeUpdate) {
      console.log(
        `Skipping database update for HHMI grants sync job ${job.id}: status is ${terminalJobBeforeUpdate.status}`,
      );
      return jobs.formatJobDTO(ctx, terminalJobBeforeUpdate);
    }

    if (syncStrategy === 'replace' && validCount === 0) {
      throw new Error('Refusing to replace all funding data with an empty result set');
    }

    await jobs.dbUpdateJob(job.id, {
      status: JobStatus.RUNNING,
      message: `Updating funding identifiers with ${plural('%s valid record(s)', validCount)}`,
    });

    // Update the scientists data in the database
    console.log(
      `🔄 Updating database with ${scientists.length} scientists using ${syncStrategy} strategy...`,
    );
    await updateHHMIScientists(scientists, syncStrategy);
    console.log(`✅ Database update completed`);

    console.log(`Successfully synced ${validCount} HHMI grants`);

    const completedJob = await conditionallyTerminalizeHhmiSyncJob(job.id, siteId, {
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
    });
    if (!completedJob) throw new Error(`HHMI grants sync job ${job.id} not found`);
    return jobs.formatJobDTO(ctx, completedJob);
  } catch (err: any) {
    console.error('HHMI scientists sync job failed:', err);

    if (job) {
      const failedJob = await conditionallyTerminalizeHhmiSyncJob(job.id, siteId, {
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
      });
      if (!failedJob) throw new Error(`HHMI grants sync job ${job.id} not found`);
      return jobs.formatJobDTO(ctx, failedJob);
    } else {
      throw err;
    }
  }
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
        await conditionallyTerminalizeHhmiSyncJob(oldJob.id, siteId, {
          status: JobStatus.FAILED,
          message: 'Job timed out',
          results: {
            ...(oldJob.results as unknown as JobResults),
            endTime: formatDate(),
          } satisfies JobResults,
        });
      }
    }
  } catch (err: any) {
    console.error('Error invalidating old HHMI sync jobs:', err);
  }
}
