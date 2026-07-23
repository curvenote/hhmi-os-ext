// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionFunctionArgs } from 'react-router';

const mockEnqueueAndDispatchJob = vi.fn();
const mockWithAppPMCContext = vi.fn();

vi.mock('../backend/context.server.js', () => ({
  withAppPMCContext: mockWithAppPMCContext,
}));

vi.mock('@curvenote/scms-server', () => ({
  enqueueAndDispatchJob: mockEnqueueAndDispatchJob,
  getPrismaClient: vi.fn(),
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
}));

const { action } = await import('./$siteName.grants.js');

function createActionArgs(syncStrategy: string): ActionFunctionArgs {
  const formData = new FormData();
  formData.set('intent', 'sync');
  formData.set('jobId', 'job-1');
  formData.set('syncStrategy', syncStrategy);

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
    mockWithAppPMCContext.mockResolvedValue({
      site: { id: 'site-1' },
      user: { id: 'user-1' },
    });
    mockEnqueueAndDispatchJob.mockResolvedValue(undefined);
  });

  it('returns 400 without enqueueing for an invalid strategy', async () => {
    const result = await action(createActionArgs('unknown'));

    expect('init' in result).toBe(true);
    if (!('init' in result)) throw new Error('Expected a data response');
    expect(result.init?.status).toBe(400);
    expect(result.data).toEqual({ error: 'Invalid sync strategy' });
    expect(mockEnqueueAndDispatchJob).not.toHaveBeenCalled();
  });

  it('enqueues replace using the snake_case payload field', async () => {
    await action(createActionArgs('replace'));

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
});
