// eslint-disable-next-line import/no-extraneous-dependencies
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionFunctionArgs } from 'react-router';

const mockEnqueueAndDispatchJob = vi.fn();
const mockWithAppPMCContext = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('../backend/context.server.js', () => ({
  withAppPMCContext: mockWithAppPMCContext,
}));

vi.mock('@curvenote/scms-server', () => ({
  enqueueAndDispatchJob: mockEnqueueAndDispatchJob,
  getPrismaClient: vi.fn(async () => ({
    job: { updateMany: mockUpdateMany },
  })),
  jobs: {},
}));

vi.mock('../backend/hhmi-grants.server.js', () => ({
  getHHMIScientists: vi.fn(),
  getHHMIScientistsStats: vi.fn(),
}));

vi.mock('../backend/airtable-config.server.js', () => ({
  getAirtableApiKey: vi.fn(),
  getAirtableBaseId: vi.fn(),
  getAirtableScientistsTableId: vi.fn(),
}));

vi.mock('../backend/jobs/hhmi-grants-sync.js', () => ({
  invalidateOldHhmiSyncJobs: vi.fn(),
  isHhmiSyncJobStale: vi.fn(),
  siteScopedJobWhere: (jobId: string, siteId: string) => ({
    id: jobId,
    payload: { path: ['site_id'], equals: siteId },
  }),
}));

const { action } = await import('./$siteName.grants.js');

function createActionArgs(
  intent: 'sync' | 'cancel',
  options: { syncStrategy?: string; jobId?: string } = {},
): ActionFunctionArgs {
  const formData = new FormData();
  formData.set('intent', intent);
  formData.set('jobId', options.jobId ?? 'job-1');
  if (options.syncStrategy) formData.set('syncStrategy', options.syncStrategy);

  return {
    request: new Request('https://example.com/site-1/grants', {
      method: 'POST',
      body: formData,
    }),
    params: { siteName: 'site-1' },
    context: {},
  } as unknown as ActionFunctionArgs;
}

describe('grants route action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));
    mockWithAppPMCContext.mockResolvedValue({
      site: { id: 'site-1' },
      user: { id: 'user-1' },
    });
    mockEnqueueAndDispatchJob.mockResolvedValue(undefined);
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 400 without enqueueing for an invalid strategy', async () => {
    const result = await action(createActionArgs('sync', { syncStrategy: 'unknown' }));

    expect('init' in result).toBe(true);
    if (!('init' in result)) throw new Error('Expected a data response');
    expect(result.init?.status).toBe(400);
    expect(result.data).toEqual({ error: 'Invalid sync strategy' });
    expect(mockEnqueueAndDispatchJob).not.toHaveBeenCalled();
  });

  it('enqueues replace using the snake_case payload field', async () => {
    await action(createActionArgs('sync', { syncStrategy: 'replace' }));

    expect(mockEnqueueAndDispatchJob).toHaveBeenCalledWith({
      job_id: 'job-1',
      job_type: 'HHMI_GRANTS_SYNC',
      payload: {
        site_id: 'site-1',
        sync_type: 'hhmi-scientists',
        sync_strategy: 'replace',
      },
      invoked_by_id: 'user-1',
    });
  });

  it('cancels only an active job belonging to the current site', async () => {
    const result = await action(createActionArgs('cancel'));

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        payload: { path: ['site_id'], equals: 'site-1' },
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      data: {
        status: 'CANCELLED',
        messages: { push: 'Job was cancelled by user' },
        date_modified: '2026-07-23T12:00:00.000Z',
      },
    });
    expect(result).toEqual({ success: true, cancelled: true });
  });

  it.each(['terminal', 'wrong-site'])('reports cancellation lost when the job is %s', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await action(createActionArgs('cancel'));

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, cancelled: false });
  });
});
