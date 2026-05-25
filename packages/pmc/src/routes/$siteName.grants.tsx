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
} from '@curvenote/scms-core';
import { withAppPMCContext } from '../backend/context.server.js';
import { JobStatus } from '@curvenote/scms-db';
import type { JobDTO } from '@curvenote/common';
import {
  getHHMIScientists,
  getHHMIScientistsStats,
  type HHMIScientist,
} from '../backend/hhmi-grants.server.js';
import { jobs, getPrismaClient } from '@curvenote/scms-server';
import {
  getAirtableApiKey,
  getAirtableBaseId,
  getAirtableScientistsTableId,
} from '../backend/airtable-config.server.js';
import { getJobs } from '../server.js';
// Note: Using hardcoded string to avoid client/server boundary issues
// This matches the constant HHMI_GRANTS_SYNC from the job handler

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
  hasMoreJobs: boolean;
  hasRunningJobs: boolean;
}

export const meta: MetaFunction<LoaderData> = () => {
  return [
    { title: 'NIHMS Funding Identifiers' },
    { name: 'description', content: 'Manage NIHMS funding identifiers and sync from Airtable' },
  ];
};

const PAGE_SIZE = 50;

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
  const ctx = await withAppPMCContext(args, [scopes.site.submissions.update]);

  // Get grants data and stats
  const [scientists, stats] = await Promise.all([getHHMIScientists(), getHHMIScientistsStats()]);

  // Get sync jobs
  const totalJobs = await jobs.count(ctx, ctx.site.id, ['HHMI_GRANTS_SYNC']);
  const { items } = await jobs.list(ctx, ctx.site.id, ['HHMI_GRANTS_SYNC'], undefined, PAGE_SIZE);

  const hasRunningJobs = items.some((job) => job.status === JobStatus.RUNNING);

  return {
    scientists,
    stats,
    jobs: items,
    hasMoreJobs: totalJobs > items.length,
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
    await jobs.invoke(
      ctx,
      {
        id: jobId,
        job_type: 'HHMI_GRANTS_SYNC',
        payload: {
          site_id: ctx.site.id,
          sync_type: 'hhmi-scientists',
        },
      },
      getJobs(),
    );

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

  if (intent === 'loadMore') {
    const currentCount = parseInt(formData.get('currentCount') as string) || 0;
    const take = PAGE_SIZE;
    const skip = currentCount;

    // Fetch additional jobs
    const { items: additionalJobs } = await jobs.list(
      ctx,
      ctx.site.id,
      ['HHMI_GRANTS_SYNC'],
      undefined,
      take,
      skip,
    );

    const totalJobs = await jobs.count(ctx, ctx.site.id, ['HHMI_GRANTS_SYNC']);
    const hasMoreJobs = totalJobs > currentCount + additionalJobs.length;

    return {
      jobs: additionalJobs,
      hasMoreJobs,
      totalCount: currentCount + additionalJobs.length,
    };
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
    <primitives.Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                NIHMS Funding Id
              </th>
              <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                Investigator Name
              </th>
              <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                ORCID
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {scientists.map((scientist) => (
              <tr key={scientist.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <ui.Badge variant="outline" className="font-mono text-xs">
                    {scientist.grantId}
                  </ui.Badge>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center">
                    <User className="mr-2 w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{scientist.fullName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <a
                    href={`https://orcid.org/${scientist.orcid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-blue-600 hover:text-blue-800"
                  >
                    {scientist.orcid}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </primitives.Card>
  );
}

function SyncJobCard({ job }: { job: JobDTO }) {
  const cancelFetcher = useFetcher();
  const results = job.results as JobResults;
  const isRunning = job.status === 'RUNNING';
  const isCancellable = isRunning;

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

function LoadMoreButton({
  fetcher,
  currentCount,
}: {
  fetcher: FetcherWithComponents<any>;
  currentCount: number;
}) {
  const isLoading = fetcher.state === 'submitting' || fetcher.state === 'loading';

  return (
    <fetcher.Form method="post" className="mt-4">
      <input type="hidden" name="intent" value="loadMore" />
      <input type="hidden" name="currentCount" value={currentCount} />
      <ui.Button
        type="submit"
        variant="link"
        size="default"
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? 'Loading...' : 'Load More Jobs'}
      </ui.Button>
    </fetcher.Form>
  );
}

export default function GrantsManagementPage({ loaderData }: { loaderData: LoaderData }) {
  const {
    scientists: initialScientists,
    stats,
    jobs: initialJobs,
    hasMoreJobs: initialHasMoreJobs,
    hasRunningJobs,
  } = loaderData;

  const syncFetcher = useFetcher({ key: 'sync' });
  const loadMoreFetcher = useFetcher({ key: 'loadMore' });
  const [jobsState, setJobs] = useState(initialJobs);
  const [hasMoreJobs, setHasMoreJobs] = useState(initialHasMoreJobs);
  const [optimisticJobId, setOptimisticJobId] = useState<string | null>(null);

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
    setHasMoreJobs(initialHasMoreJobs);
  }, [initialJobs, initialHasMoreJobs]);

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

  // Handle load more response
  useEffect(() => {
    if (loadMoreFetcher.data && loadMoreFetcher.state === 'idle') {
      const { jobs: newJobs, hasMoreJobs: newHasMoreJobs } = loadMoreFetcher.data as {
        jobs: JobDTO[];
        hasMoreJobs: boolean;
      };
      setJobs((prev) => [...prev, ...newJobs]);
      setHasMoreJobs(newHasMoreJobs);
    }
  }, [loadMoreFetcher.data, loadMoreFetcher.state]);

  return (
    <PageFrame title="NIHMS Funding Identifiers">
      <div className="space-y-6">
        {/* Stats and Sync Section */}
        <StatsSection
          stats={statsData}
          actionButton={<SyncButton fetcher={syncFetcher} disabled={hasRunningJobs} />}
        />

        {/* Grants Table */}
        <section>
          <SectionWithHeading heading="Current NIHMS Funding Identifiers" icon={<User />}>
            <GrantsTable scientists={initialScientists} />
          </SectionWithHeading>
        </section>

        {/* Sync Jobs History */}
        <section>
          <SectionWithHeading heading="Sync Jobs" icon={<List />}>
            {displayedJobs.length === 0 ? (
              <primitives.Card className="p-6 text-center text-gray-500">
                <RefreshCw className="mx-auto mb-2 w-8 h-8" />
                <p>No sync jobs yet. Click "Sync Funding Identifiers" to start your first sync.</p>
              </primitives.Card>
            ) : (
              <>
                <ul className="space-y-4">
                  {displayedJobs.map((job) => (
                    <SyncJobCard key={job.id} job={job} />
                  ))}
                </ul>
                {hasMoreJobs && (
                  <LoadMoreButton fetcher={loadMoreFetcher} currentCount={displayedJobs.length} />
                )}
              </>
            )}
          </SectionWithHeading>
        </section>
      </div>
    </PageFrame>
  );
}
