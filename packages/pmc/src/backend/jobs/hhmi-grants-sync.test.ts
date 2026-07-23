// eslint-disable-next-line import/no-extraneous-dependencies
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatus } from '@curvenote/scms-db';

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockUpdateMany = vi.fn();
const mockDbStartJob = vi.fn();
const mockDbUpdateJob = vi.fn();
const mockFormatJobDTO = vi.fn((_ctx, job) => job);

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    job: { findMany: mockFindMany, findFirst: mockFindFirst, updateMany: mockUpdateMany },
  })),
  jobs: {
    dbStartJob: mockDbStartJob,
    dbUpdateJob: mockDbUpdateJob,
    formatJobDTO: mockFormatJobDTO,
  },
}));

const {
  HHMI_GRANTS_SYNC,
  conditionallyTerminalizeHhmiSyncJob,
  hhmiGrantsSyncHandler,
  invalidateOldHhmiSyncJobs,
  isHhmiSyncJobStale,
} = await import('./hhmi-grants-sync.js');

describe('invalidateOldHhmiSyncJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));
    mockFindMany.mockResolvedValue([
      { id: 'queued-job', results: {}, status: JobStatus.QUEUED },
      { id: 'running-job', results: {}, status: JobStatus.RUNNING },
    ]);
    mockFindFirst.mockResolvedValue(null);
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails only stale queued and running sync jobs for the current site', async () => {
    await invalidateOldHhmiSyncJobs('site-1');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        job_type: HHMI_GRANTS_SYNC,
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        payload: { path: ['site_id'], equals: 'site-1' },
        date_modified: { lt: '2026-07-23T11:55:00.000Z' },
      },
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'queued-job',
          payload: { path: ['site_id'], equals: 'site-1' },
          status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        },
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          messages: { push: 'Job timed out' },
        }),
      }),
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'running-job',
          payload: { path: ['site_id'], equals: 'site-1' },
          status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        },
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          messages: { push: 'Job timed out' },
        }),
      }),
    );
  });

  it('does not update jobs when none are stale', async () => {
    mockFindMany.mockResolvedValue([]);

    await invalidateOldHhmiSyncJobs('site-1');

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('swallows stale-job query errors without updating jobs', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFindMany.mockRejectedValue(new Error('database unavailable'));

    await expect(invalidateOldHhmiSyncJobs('site-1')).resolves.toBeUndefined();

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Error invalidating old HHMI sync jobs:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('identifies only active jobs with stale modification times', () => {
    expect(
      isHhmiSyncJobStale({
        status: JobStatus.RUNNING,
        date_modified: '2026-07-23T11:54:59.999Z',
      }),
    ).toBe(true);
    expect(
      isHhmiSyncJobStale({
        status: JobStatus.QUEUED,
        date_modified: '2026-07-23T11:59:59.999Z',
      }),
    ).toBe(false);
    expect(
      isHhmiSyncJobStale({
        status: JobStatus.COMPLETED,
        date_modified: '2026-07-23T10:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('does not overwrite a terminal status when completing a job', async () => {
    const cancelledJob = { id: 'job-1', status: JobStatus.CANCELLED };
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindFirst.mockResolvedValue(cancelledJob);

    const result = await conditionallyTerminalizeHhmiSyncJob('job-1', 'site-1', {
      status: JobStatus.COMPLETED,
      message: 'completed',
      results: { processedCount: 1 },
    });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        payload: { path: ['site_id'], equals: 'site-1' },
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
      },
      data: expect.objectContaining({
        status: JobStatus.COMPLETED,
        messages: { push: 'completed' },
      }),
    });
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        payload: { path: ['site_id'], equals: 'site-1' },
      },
    });
    expect(result).toBe(cancelledJob);
  });

  it.each([JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.COMPLETED])(
    'does not restart a job already in terminal status %s',
    async (status) => {
      const terminalJob = { id: 'terminal-job', status };
      mockFindFirst.mockResolvedValue(terminalJob);

      const result = await hhmiGrantsSyncHandler({} as never, {
        id: 'terminal-job',
        job_type: HHMI_GRANTS_SYNC,
        payload: { site_id: 'site-1', sync_type: 'hhmi-grants' },
      });

      expect(mockDbStartJob).not.toHaveBeenCalled();
      expect(mockFormatJobDTO).toHaveBeenCalledWith({}, terminalJob);
      expect(result).toBe(terminalJob);
    },
  );
});
