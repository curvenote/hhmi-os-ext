import { uuidv7 } from 'uuidv7';
import type {
  ActionFunctionArgs,
  FetcherWithComponents,
  LoaderFunctionArgs,
  MetaFunction,
} from 'react-router';
import { useFetcher, data } from 'react-router';
import { RefreshCw, List, User, Database } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import type { StatCardData } from '@curvenote/scms-core';
import {
  PageFrame,
  ui,
  primitives,
  formatDate,
  StatsSection,
  SectionWithHeading,
  scopes,
  useRevalidateOnInterval,
} from '@curvenote/scms-core';
import { withAppPMCContext } from '../backend/context.server.js';
import { JobStatus } from '@curvenote/scms-db';
import type { JobDTO } from '@curvenote/common';
import {
  getHHMIScientists,
  getHHMIScientistsStats,
  type HHMIScientist,
} from '../backend/hhmi-grants.server.js';
import { jobs, getPrismaClient, enqueueAndDispatchJob } from '@curvenote/scms-server';
import {
  getAirtableApiKey,
  getAirtableBaseId,
  getAirtableScientistsTableId,
} from '../backend/airtable-config.server.js';

type JobResults = {
  startTime?: string;
  endTime?: string;
  totalRecords?: number;
  processedCount?: number;
  validCount?: number;
  skippedCount?: number;
  errorCount?: number;
  errors?: Array<{ recordId?: string; error: string }>;
  syncStrategy?: 'merge' | 'replace';
};
interface LoaderData {
  scientists: HHMIScientist[];
  stats: {
    totalScientists: number;
    lastUpdated: string | null;
  };
  jobs: JobDTO[];
  hasRunningJobs: boolean;
}

export const meta: MetaFunction<LoaderData> = () => {
  return [
    { title: 'NIHMS Funding Identifiers' },
    { name: 'description', content: 'Manage NIHMS funding identifiers and sync from Airtable' },
  ];
};

const HISTORY_LIMIT = 10;
// Fetch a small buffer above history so an active job doesn't push older runs off the list
const JOBS_FETCH_LIMIT = HISTORY_LIMIT + 5;

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
  const ctx = await withAppPMCContext(args, [scopes.site.submissions.update]);

  // Get grants data and stats
  const [scientists, stats] = await Promise.all([getHHMIScientists(), getHHMIScientistsStats()]);

  // Get recent sync jobs (history is capped client-side to HISTORY_LIMIT)
  const { items } = await jobs.list(
    ctx,
    ctx.site.id,
    ['HHMI_GRANTS_SYNC'],
    undefined,
    JOBS_FETCH_LIMIT,
  );

  const hasRunningJobs = items.some(
    (job) => job.status === JobStatus.RUNNING || job.status === JobStatus.QUEUED,
  );

  return {
    scientists,
    stats,
    jobs: items,
    hasRunningJobs,
  };
}

export async function action(args: ActionFunctionArgs) {
  const ctx = await withAppPMCContext(args, [scopes.site.submissions.update]);
  const formData = await args.request.formData();
  const intent = formData.get('intent');

  if (intent === 'cancel') {
    const jobId = formData.get('jobId') as string;

    // Mark the job as cancelled
    const prisma = await getPrismaClient();
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.CANCELLED,
        messages: {
          push: 'Job was cancelled by user',
        },
        date_modified: new Date().toISOString(),
      },
      select: { id: true },
    });

    return { success: true, cancelled: true };
  }

  if (intent === 'sync') {
    const jobId = formData.get('jobId') as string;

    // Create a new HHMI_GRANTS_SYNC job
    await enqueueAndDispatchJob({
      job_id: jobId,
      job_type: 'HHMI_GRANTS_SYNC',
      payload: {
        site_id: ctx.site.id,
        sync_type: 'hhmi-scientists',
      },
      invoked_by_id: ctx.user?.id,
    });

    return { success: true, jobId };
  }

  if (intent === 'test-connection') {
    // Test Airtable connection without creating a job
    try {
      const apiKey = await getAirtableApiKey();
      const baseId = await getAirtableBaseId();
      const tableId = await getAirtableScientistsTableId();

      const testUrl = `https://api.airtable.com/v0/${baseId}/${tableId}?maxRecords=1`;

      const response = await fetch(testUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const responseData = await response.json();

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        config: {
          baseId,
          tableId,
          apiKeyLength: apiKey?.length,
          hasApiKey: !!apiKey,
        },
        data: response.ok ? { recordCount: responseData.records?.length } : responseData,
      };
    } catch (error: any) {
      return data(
        {
          success: false,
          error: error.message,
          stack: error.stack,
        },
        { status: 500 },
      );
    }
  }

  return data({ error: 'Invalid intent' }, { status: 400 });
}

function SyncButton({
  fetcher,
  disabled,
}: {
  fetcher: FetcherWithComponents<any>;
  disabled: boolean;
}) {
  const isUpdating = fetcher.state === 'submitting' || fetcher.state === 'loading';

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const jobId = uuidv7();
      const formData = new FormData();
      formData.append('intent', 'sync');
      formData.append('jobId', jobId);
      fetcher.submit(formData, { method: 'post' });
    },
    [fetcher],
  );

  return (
    <fetcher.Form method="post" onSubmit={handleSubmit}>
      <ui.Button
        type="submit"
        variant="default"
        size="default"
        disabled={isUpdating || disabled}
        aria-busy={isUpdating || disabled}
      >
        <RefreshCw className={isUpdating ? 'mr-2 animate-spin' : 'mr-2'} />
        Sync Funding Identifiers
      </ui.Button>
    </fetcher.Form>
  );
}

function FieldValue({
  value,
  missingLabel = 'Missing',
  className,
  asLink,
}: {
  value?: string | null;
  missingLabel?: string;
  className?: string;
  asLink?: { href: string; mono?: boolean };
}) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return <span className={`font-medium text-red-600 ${className ?? ''}`}>{missingLabel}</span>;
  }
  if (asLink) {
    return (
      <a
        href={asLink.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-sm text-blue-600 hover:text-blue-800 ${asLink.mono ? 'font-mono' : ''} ${className ?? ''}`}
      >
        {trimmed}
      </a>
    );
  }
  return <span className={className}>{trimmed}</span>;
}

const SCIENTIST_FIELD_LABELS = {
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  orcid: 'ORCID',
  grantId: 'Funding ID',
} as const;

type ScientistFieldKey = keyof typeof SCIENTIST_FIELD_LABELS;

function getMissingScientistFields(scientist: HHMIScientist): ScientistFieldKey[] {
  const checks: ScientistFieldKey[] = [
    'grantId',
    'fullName',
    'firstName',
    'lastName',
    'email',
    'orcid',
  ];
  return checks.filter((key) => !scientist[key]?.trim());
}

function MissingFieldsSummary({ scientists }: { scientists: HHMIScientist[] }) {
  const incomplete = scientists
    .map((scientist) => ({
      scientist,
      missing: getMissingScientistFields(scientist),
    }))
    .filter(({ missing }) => missing.length > 0);

  if (incomplete.length === 0) return null;

  return (
    <primitives.Card className="overflow-hidden border-red-200 bg-red-50/40">
      <div className="border-b border-red-100 px-3 py-2">
        <p className="text-sm font-medium text-red-800">
          {incomplete.length} record{incomplete.length === 1 ? '' : 's'} with missing fields
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-red-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-red-700">
                NIHMS Funding Id
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-red-700">
                Missing
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-red-100 bg-white/70">
            {incomplete.map(({ scientist, missing }) => (
              <tr key={scientist.id}>
                <td className="px-3 py-1.5 whitespace-nowrap align-top">
                  <ui.Badge
                    variant="outline"
                    className="border-red-300 font-mono text-xs text-red-700"
                  >
                    {scientist.grantId?.trim() || 'Missing funding ID'}
                  </ui.Badge>
                </td>
                <td className="px-3 py-1.5 align-top">
                  <div className="flex flex-wrap gap-1">
                    {missing.map((field) => (
                      <span
                        key={field}
                        className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700"
                      >
                        {SCIENTIST_FIELD_LABELS[field]}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </primitives.Card>
  );
}

function GrantsTable({ scientists }: { scientists: HHMIScientist[] }) {
  if (scientists.length === 0) {
    return (
      <primitives.Card className="p-6 text-center text-gray-500">
        <Database className="mx-auto mb-2 w-8 h-8" />
        <p>No funding data available. Click "Sync Funding Identifiers" to load data.</p>
      </primitives.Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <MissingFieldsSummary scientists={scientists} />
      <primitives.Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                  NIHMS Funding Id
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                  Investigator
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                  ORCID
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {scientists.map((scientist) => (
                <tr key={scientist.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap align-top">
                    <ui.Badge variant="outline" className="font-mono text-xs">
                      {scientist.grantId}
                    </ui.Badge>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-2">
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <div className="min-w-0 space-y-1">
                        <div className="font-medium text-gray-900">
                          <FieldValue value={scientist.fullName} missingLabel="Missing full name" />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-600">
                          <span>
                            First:{' '}
                            <FieldValue
                              value={scientist.firstName}
                              missingLabel="Missing"
                              className="text-gray-900"
                            />
                          </span>
                          <span>
                            Last:{' '}
                            <FieldValue
                              value={scientist.lastName}
                              missingLabel="Missing"
                              className="text-gray-900"
                            />
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          Email:{' '}
                          <FieldValue
                            value={scientist.email}
                            missingLabel="Missing"
                            className="text-gray-900"
                            asLink={
                              scientist.email?.trim()
                                ? { href: `mailto:${scientist.email.trim()}` }
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap align-top">
                    <FieldValue
                      value={scientist.orcid}
                      missingLabel="Missing ORCID"
                      asLink={
                        scientist.orcid?.trim()
                          ? { href: `https://orcid.org/${scientist.orcid.trim()}`, mono: true }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </primitives.Card>
    </div>
  );
}

function isActiveSyncJob(job: JobDTO) {
  return job.status === JobStatus.QUEUED || job.status === JobStatus.RUNNING;
}

function SyncJobCard({ job }: { job: JobDTO }) {
  const cancelFetcher = useFetcher();
  const results = job.results as JobResults;
  const isActive = isActiveSyncJob(job);
  const isCancellable = isActive;

  return (
    <li>
      <primitives.Card className="flex flex-col gap-4 p-4 lg:flex-row">
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <div className="flex gap-2 items-center">
              <span className="font-medium">Status:</span>
              <span
                className={`capitalize ${
                  job.status === 'COMPLETED'
                    ? 'text-green-600'
                    : job.status === 'FAILED'
                      ? 'text-red-600'
                      : job.status === 'RUNNING'
                        ? 'text-blue-600'
                        : job.status === 'QUEUED'
                          ? 'text-blue-600'
                          : job.status === 'CANCELLED'
                            ? 'text-orange-600'
                            : 'text-gray-600'
                }`}
              >
                {job.status.toLowerCase()}
              </span>
            </div>
            {isCancellable && (
              <cancelFetcher.Form method="post" className="flex items-center h-6">
                <input type="hidden" name="intent" value="cancel" />
                <input type="hidden" name="jobId" value={job.id} />
                <ui.Button
                  className="flex gap-0 p-0"
                  type="submit"
                  variant="link"
                  disabled={cancelFetcher.state === 'submitting'}
                >
                  Cancel
                </ui.Button>
              </cancelFetcher.Form>
            )}
          </div>

          <div className="flex gap-2 mb-1 text-sm text-gray-500">
            <div>Started: {formatDate(job.date_created, 'yyyy-MM-dd HH:mm:ss')}</div>
            <div>
              Ended:{' '}
              {job.date_modified ? formatDate(job.date_modified, 'yyyy-MM-dd HH:mm:ss') : '—'}
            </div>
          </div>

          <div className="flex gap-4">
            <div className="text-sm">
              <div>Total records: {results?.totalRecords ?? '—'}</div>
              <div>
                Processed: {results?.processedCount ?? '—'} | Valid: {results?.validCount ?? '—'}
              </div>
              <div>
                Skipped: {results?.skippedCount ?? '—'} | Errors: {results?.errorCount ?? '—'}
              </div>
              {results?.syncStrategy && <div>Strategy: {results.syncStrategy}</div>}
            </div>
          </div>

          {(results?.errorCount ?? 0) > 0 && results?.errors && (
            <div className="mt-2">
              <div className="mb-1 text-xs font-medium text-red-600">Errors:</div>
              <div className="space-y-1 text-xs text-red-600">
                {results.errors.slice(0, 3).map((error, index) => (
                  <div key={index}>
                    {error.recordId && `Record ${error.recordId}: `}
                    {error.error}
                  </div>
                ))}
                {results.errors.length > 3 && (
                  <div>... and {results.errors.length - 3} more errors</div>
                )}
              </div>
            </div>
          )}
        </div>
      </primitives.Card>
    </li>
  );
}

export default function GrantsManagementPage({ loaderData }: { loaderData: LoaderData }) {
  const { scientists: initialScientists, stats, jobs: initialJobs, hasRunningJobs } = loaderData;

  const syncFetcher = useFetcher({ key: 'sync' });
  const [jobsState, setJobs] = useState(initialJobs);
  const [optimisticJobId, setOptimisticJobId] = useState<string | null>(null);
  // Session latch: keep jobs visible in the featured slot after they leave QUEUED/RUNNING.
  // Cleared on full page refresh / navigation remount.
  const [latchedJobIds, setLatchedJobIds] = useState<string[]>([]);

  // Convert stats to array format for StatsSection
  const statsData: StatCardData[] = [
    {
      type: 'count',
      label: 'Total Investigators',
      value: stats.totalScientists,
      colorClass: 'text-blue-600',
    },
    {
      type: 'date',
      label: 'Last Updated',
      value: stats.lastUpdated ? formatDate(stats.lastUpdated, 'yyyy-MM-dd HH:mm:ss') : 'Never',
    },
  ];

  // Update jobs from loader data
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  // Handle optimistic UI for new sync jobs
  useEffect(() => {
    if (syncFetcher.state !== 'idle' && syncFetcher.formData) {
      const jobId = syncFetcher.formData.get('jobId') as string;
      setOptimisticJobId(jobId);

      const optimisticJob = {
        id: jobId,
        job_type: 'HHMI_GRANTS_SYNC',
        status: 'RUNNING' as const,
        date_created: new Date().toISOString(),
        payload: { site_id: '', sync_type: 'hhmi-scientists' },
        messages: [],
        links: { self: '' },
        results: {
          totalRecords: '—',
          processedCount: '—',
          validCount: '—',
          errorCount: 0,
        },
      } as JobDTO & { date_modified: undefined };

      // Filter out any existing job with the same ID and add optimistic job
      setJobs((prevJobs) => [optimisticJob, ...prevJobs.filter((job) => job.id !== jobId)]);
    } else if (syncFetcher.state === 'idle' && optimisticJobId) {
      // Clear optimistic job ID when sync is complete
      setOptimisticJobId(null);
    }
  }, [syncFetcher.state, syncFetcher.formData, optimisticJobId]);

  // Filter out optimistic job from displayed jobs when real data comes in
  const displayedJobs = optimisticJobId
    ? jobsState.filter((job, index) => {
        if (job.id === optimisticJobId) {
          return index === 0; // Only keep the first occurrence (optimistic job)
        }
        return true;
      })
    : jobsState;

  // Latch any job we observe as queued/running so it stays featured after completion
  useEffect(() => {
    const activeIds = displayedJobs.filter(isActiveSyncJob).map((job) => job.id);
    if (activeIds.length === 0) return;

    setLatchedJobIds((prev) => {
      const missing = activeIds.filter((id) => !prev.includes(id));
      return missing.length === 0 ? prev : [...prev, ...missing];
    });
  }, [displayedJobs]);

  const trulyActiveJobs = displayedJobs.filter(isActiveSyncJob);
  const featuredJobs = latchedJobIds
    .map((id) => displayedJobs.find((job) => job.id === id))
    .filter((job): job is JobDTO => job != null);
  const featuredJobIds = new Set(featuredJobs.map((job) => job.id));
  const historyJobs = displayedJobs
    .filter((job) => !isActiveSyncJob(job) && !featuredJobIds.has(job.id))
    .slice(0, HISTORY_LIMIT);

  const hasActiveSyncJobs =
    hasRunningJobs ||
    trulyActiveJobs.length > 0 ||
    syncFetcher.state !== 'idle' ||
    !!optimisticJobId;
  const syncDisabled = hasActiveSyncJobs;

  // Revalidate the page while a sync job is queued/running (same pattern as submissions polling)
  useRevalidateOnInterval({ enabled: hasActiveSyncJobs, interval: 1500 });

  return (
    <PageFrame title="NIHMS Funding Identifiers">
      <div className="space-y-6">
        {/* Stats and Sync Section */}
        <StatsSection
          stats={statsData}
          actionButton={<SyncButton fetcher={syncFetcher} disabled={syncDisabled} />}
        />

        {featuredJobs.length > 0 && (
          <ul className="space-y-4">
            {featuredJobs.map((job) => (
              <SyncJobCard key={job.id} job={job} />
            ))}
          </ul>
        )}

        {/* Grants Table */}
        <section>
          <SectionWithHeading heading="Current NIHMS Funding Identifiers" icon={<User />}>
            <GrantsTable scientists={initialScientists} />
          </SectionWithHeading>
        </section>

        {/* Sync Jobs History */}
        <section>
          <SectionWithHeading heading="Sync Job History" icon={<List />}>
            {historyJobs.length === 0 ? (
              <primitives.Card className="p-6 text-center text-gray-500">
                <RefreshCw className="mx-auto mb-2 w-8 h-8" />
                <p>
                  {displayedJobs.length === 0
                    ? 'No sync jobs yet. Click "Sync Funding Identifiers" to start your first sync.'
                    : 'No completed sync jobs yet.'}
                </p>
              </primitives.Card>
            ) : (
              <ul className="space-y-4">
                {historyJobs.map((job) => (
                  <SyncJobCard key={job.id} job={job} />
                ))}
              </ul>
            )}
          </SectionWithHeading>
        </section>
      </div>
    </PageFrame>
  );
}
