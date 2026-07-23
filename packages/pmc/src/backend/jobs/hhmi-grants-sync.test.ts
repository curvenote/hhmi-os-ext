// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatus } from '@curvenote/scms-db';

const mockFindMany = vi.fn();
const mockDbUpdateJob = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    job: { findMany: mockFindMany },
  })),
  jobs: {
    dbUpdateJob: mockDbUpdateJob,
  },
}));

const { HHMI_GRANTS_SYNC, invalidateOldHhmiSyncJobs } = await import('./hhmi-grants-sync.js');

describe('invalidateOldHhmiSyncJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([
      { id: 'queued-job', results: {}, status: JobStatus.QUEUED },
      { id: 'running-job', results: {}, status: JobStatus.RUNNING },
    ]);
  });

  it('fails stale queued and running sync jobs', async () => {
    await invalidateOldHhmiSyncJobs();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        job_type: HHMI_GRANTS_SYNC,
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        date_created: { lt: expect.any(String) },
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
});
