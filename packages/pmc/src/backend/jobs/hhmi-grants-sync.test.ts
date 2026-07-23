// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatus } from '@curvenote/scms-db';

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockDbStartJob = vi.fn();
const mockDbUpdateJob = vi.fn();
const mockFormatJobDTO = vi.fn((_ctx, job) => job);

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    job: { findMany: mockFindMany, findUnique: mockFindUnique },
  })),
  jobs: {
    dbStartJob: mockDbStartJob,
    dbUpdateJob: mockDbUpdateJob,
    formatJobDTO: mockFormatJobDTO,
  },
}));

const { HHMI_GRANTS_SYNC, hhmiGrantsSyncHandler, invalidateOldHhmiSyncJobs } =
  await import('./hhmi-grants-sync.js');

describe('invalidateOldHhmiSyncJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([
      { id: 'queued-job', results: {}, status: JobStatus.QUEUED },
      { id: 'running-job', results: {}, status: JobStatus.RUNNING },
    ]);
    mockFindUnique.mockResolvedValue(null);
  });

  it('fails only stale queued and running sync jobs for the current site', async () => {
    await invalidateOldHhmiSyncJobs('site-1');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        job_type: HHMI_GRANTS_SYNC,
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        payload: { path: ['site_id'], equals: 'site-1' },
        date_modified: { lt: expect.any(String) },
      },
    });
    expect(mockDbUpdateJob).toHaveBeenCalledTimes(2);
    expect(mockDbUpdateJob).toHaveBeenCalledWith(
      'queued-job',
      expect.objectContaining({ status: JobStatus.FAILED, message: 'Job timed out' }),
    );
    expect(mockDbUpdateJob).toHaveBeenCalledWith(
      'running-job',
      expect.objectContaining({ status: JobStatus.FAILED, message: 'Job timed out' }),
    );
  });

  it.each([JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.COMPLETED])(
    'does not restart a job already in terminal status %s',
    async (status) => {
      const terminalJob = { id: 'terminal-job', status };
      mockFindUnique.mockResolvedValue(terminalJob);

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
