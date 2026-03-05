import { uuidv7 } from 'uuidv7';
import type {
  ActionFunctionArgs,
  FetcherWithComponents,
  LoaderFunctionArgs,
  MetaFunction,
} from 'react-router';
import { useFetcher, data } from 'react-router';
import { RefreshCw, List } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import {
  PageFrame,
  ui,
  primitives,
  formatDate,
  SectionWithHeading,
  scopes,
} from '@curvenote/scms-core';
import { withAppPMCContext } from '../backend/context.server.js';
import { JobStatus } from '@curvenote/scms-db';
import { jobs, getPrismaClient } from '@curvenote/scms-server';
import type { JobDTO } from '@curvenote/common';
import { getJobs } from '../server.js';

type JobResults = {
  totalSubmissions?: number;
  modifiedCount?: number;
  unmodifiedCount?: number;
  errorCount?: number;
  modifiedSubmissions?: Array<{ id: string; title: string }>;
  errors?: Array<{ submissionId?: string; error: string; title?: string }>;
  error?: string;
};

type WorkflowSyncJobPayload = {
  site_id?: string;
  triggered_by_user_id?: string;
  triggered_by_user_name?: string;
};
interface LoaderData {
  jobs: JobDTO[];
  hasMore: boolean;
  totalJobs: number;
  hasRunningJobs: boolean;
}

export const meta: MetaFunction<LoaderData> = () => {
  return [
    { title: 'PMC Airtable Status' },
    { name: 'description', content: 'Monitor PMC Airtable sync status' },
  ];
};

const PAGE_SIZE = 100;

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
  const ctx = await withAppPMCContext(args, [scopes.site.submissions.update]);
  const totalJobs = await jobs.count(ctx, ctx.site.id, ['PMC_WORKFLOW_SYNC']);

  // Fetch last 100 airtable-status jobs for this site
  const { items } = await jobs.list(ctx, ctx.site.id, ['PMC_WORKFLOW_SYNC'], undefined, PAGE_SIZE);

  const hasRunningJobs = items.some((job) => job.status === JobStatus.RUNNING);

  return { jobs: items, hasMore: totalJobs > items.length, totalJobs, hasRunningJobs };
}

export async function action(args: ActionFunctionArgs) {
  const ctx = await withAppPMCContext(args, [scopes.site.submissions.update]);

  const formData = await args.request.formData();
  const intent = formData.get('intent');

  if (intent === 'cancel') {
    const jobId = formData.get('jobId') as string;

    // Mark the job as failed with a cancellation message
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
    });

    return { success: true, cancelled: true };
  }

  if (intent === 'sync') {
    const jobId = formData.get('jobId') as string;

    // Create a new PMC_WORKFLOW_SYNC job for this site (triggered by current user)
    const triggeredByUserName =
      ctx.user?.display_name ?? ctx.user?.email ?? ctx.user?.username ?? 'User';
    await jobs.create(
      ctx,
      {
        id: jobId,
        job_type: 'PMC_WORKFLOW_SYNC',
        payload: {
          site_id: ctx.site.id,
          triggered_by_user_id: ctx.user?.id,
          triggered_by_user_name: triggeredByUserName,
        },
      },
      getJobs(),
    );
    // Return success response instead of redirect to trigger revalidation
    return { success: true, jobId };
  }

  if (intent === 'loadMore') {
    const currentCount = parseInt(formData.get('currentCount') as string) || 0;
    const take = PAGE_SIZE;
    const skip = currentCount;

    // Fetch additional jobs
    const { items: additionalJobs } = await jobs.list(
      ctx,
      ctx.site.id,
      ['PMC_WORKFLOW_SYNC'],
      undefined,
      take,
      skip,
    );

    const totalJobs = await jobs.count(ctx, ctx.site.id, ['PMC_WORKFLOW_SYNC']);

    const hasMore = totalJobs > currentCount + additionalJobs.length;

    return {
      jobs: additionalJobs,
      hasMore,
      totalCount: currentCount + additionalJobs.length,
    };
  }

  // Fallback for any other intents
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
        Update Deposits from Airtable
      </ui.Button>
    </fetcher.Form>
  );
}

function UpdateJobCard({ job }: { job: JobDTO }) {
  const cancelFetcher = useFetcher();
  const results = job.results as JobResults;
  const payload = job.payload as WorkflowSyncJobPayload | undefined;
  const isRunning = job.status === 'RUNNING';
  const isCancellable = isRunning;

  return (
    <li>
      <primitives.Card className="flex flex-col gap-4 p-4 lg:flex-row">
        <div>
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
                  // size="sm"
                  disabled={cancelFetcher.state === 'submitting'}
                >
                  {/* <X className="w-3 h-3" /> */}
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
          {(payload?.triggered_by_user_name ?? payload?.triggered_by_user_id) && (
            <div className="mb-1 text-sm text-gray-500">
              Triggered by:{' '}
              <span title={payload?.triggered_by_user_id ?? undefined}>
                {payload?.triggered_by_user_name ?? '—'}
              </span>
            </div>
          )}
          <div className="flex gap-4">
            <div className="text-sm">
              <div>Total submissions: {results?.totalSubmissions ?? '—'}</div>
              <div>
                Modified: {results?.modifiedCount ?? '—'} | Unmodified:{' '}
                {results?.unmodifiedCount ?? '—'}
              </div>
              {(results?.errorCount ?? 0) > 0 && (
                <div className="text-red-600">Errors: {results.errorCount}</div>
              )}
              {results?.error && <div className="text-red-600">Error: {results.error}</div>}
            </div>
          </div>
        </div>
        <div>
          {(results?.modifiedCount ?? 0) > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium text-gray-600">Modified submissions:</div>
              <div className="flex flex-wrap gap-1">
                {results.modifiedSubmissions?.map(({ id, title }) => (
                  <a
                    key={id}
                    href={`/app/sites/pmc/deposits/${id}`}
                    className="px-2 py-1 text-xs text-blue-800 bg-blue-100 rounded transition-colors hover:bg-blue-200"
                    title={`${title ?? id} (${id})`}
                  >
                    {(title ?? id).slice(0, 32)}
                    {(title ?? id).length > 32 ? '...' : ''}
                  </a>
                ))}
              </div>
            </div>
          )}
          {(results?.errorCount ?? 0) > 0 && results?.errors && results.errors.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium text-red-600">Submissions with errors:</div>
              <div className="flex flex-wrap gap-1">
                {results.errors.map((entry, index) =>
                  entry.submissionId ? (
                    <a
                      key={entry.submissionId}
                      href={`/app/sites/pmc/deposits/${entry.submissionId}`}
                      className="px-2 py-1 text-xs text-red-800 bg-red-100 rounded transition-colors hover:bg-red-200"
                      title={entry.error}
                    >
                      {entry.title ?? `…${entry.submissionId.slice(-8)}`}
                    </a>
                  ) : (
                    <span
                      key={index}
                      className="px-2 py-1 text-xs text-red-800 bg-red-100 rounded"
                      title={entry.error}
                    >
                      {entry.title ?? `Error ${index + 1}`}
                    </span>
                  ),
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

export default function PMCStatusPage({ loaderData }: { loaderData: LoaderData }) {
  const { jobs: initialJobs, hasMore: initialHasMore, hasRunningJobs } = loaderData;
  const syncFetcher = useFetcher({ key: 'sync' });
  const loadMoreFetcher = useFetcher({ key: 'loadMore' });
  const [jobsState, setJobs] = useState(initialJobs);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [optimisticJobId, setOptimisticJobId] = useState<string | null>(null);

  // Update jobs from loader data
  useEffect(() => {
    setJobs(initialJobs);
    setHasMore(initialHasMore);
  }, [initialJobs, initialHasMore]);

  // Handle optimistic UI for new sync jobs
  useEffect(() => {
    if (syncFetcher.state !== 'idle' && syncFetcher.formData) {
      const jobId = syncFetcher.formData.get('jobId') as string;
      setOptimisticJobId(jobId);

      const optimisticJob = {
        id: jobId,
        job_type: 'PMC_WORKFLOW_SYNC',
        status: 'RUNNING' as const,
        date_created: new Date().toISOString(),
        payload: { site_id: '' },
        messages: [],
        links: { self: '' },
        results: {
          totalSubmissions: '—',
          modifiedCount: '—',
          unmodifiedCount: '—',
          errorCount: 0,
        },
      } as JobDTO & { date_modified: undefined };

      // Filter out any existing job with the same ID and add optimistic job
      setJobs((prevJobs) => [optimisticJob, ...prevJobs.filter((job) => job.id !== jobId)]);
    } else if (syncFetcher.state === 'idle' && optimisticJobId) {
      // When sync is complete, just clear the optimistic job ID
      // The real job data will come from the loader revalidation
      setOptimisticJobId(null);
    }
  }, [syncFetcher.state, syncFetcher.formData, optimisticJobId]);

  // Filter out optimistic job from the displayed jobs when real data comes in
  const displayedJobs = optimisticJobId
    ? jobsState.filter((job, index) => {
        // Keep the optimistic job (should be first) and filter out any real job with same ID
        if (job.id === optimisticJobId) {
          return index === 0; // Only keep the first occurrence (optimistic job)
        }
        return true;
      })
    : jobsState;

  // Handle load more response
  useEffect(() => {
    if (loadMoreFetcher.data && loadMoreFetcher.state === 'idle') {
      const { jobs: newJobs, hasMore: newHasMore } = loadMoreFetcher.data as {
        jobs: JobDTO[];
        hasMore: boolean;
      };
      setJobs((prev) => [...prev, ...newJobs]);
      setHasMore(newHasMore);
    }
  }, [loadMoreFetcher.data, loadMoreFetcher.state]);

  return (
    <PageFrame title={<span className="flex gap-2 items-center">PMC Airtable Status</span>}>
      <SyncButton fetcher={syncFetcher} disabled={hasRunningJobs} />
      <section>
        <SectionWithHeading heading="Recent Jobs" icon={<List />}>
          <ul className="space-y-4">
            {displayedJobs.map((job) => (
              <UpdateJobCard key={job.id} job={job} />
            ))}
          </ul>
          {hasMore && (
            <LoadMoreButton fetcher={loadMoreFetcher} currentCount={displayedJobs.length} />
          )}
        </SectionWithHeading>
      </section>
    </PageFrame>
  );
}
