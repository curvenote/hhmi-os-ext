// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { JobStatus } from '@curvenote/scms-db';
import type { JobDTO } from '@curvenote/common';
import { getNextLatchedJobIds, partitionSyncJobsForDisplay } from './grants-job-display.js';

function makeJob(id: string, status: JobStatus, dateCreated: string): JobDTO {
  return {
    id,
    status,
    date_created: dateCreated,
  } as JobDTO;
}

describe('funding sync job display', () => {
  it('features a newly active job before the latch effect runs', () => {
    const active = makeJob('active', JobStatus.RUNNING, '2026-07-23T12:00:00.000Z');

    const result = partitionSyncJobsForDisplay([active], [], 10);

    expect(result.featuredJobs.map((job) => job.id)).toEqual(['active']);
    expect(result.historyJobs).toEqual([]);
  });

  it('deduplicates featured jobs and sorts featured and history newest-first', () => {
    const jobs = [
      makeJob('history-old', JobStatus.COMPLETED, '2026-07-23T09:00:00.000Z'),
      makeJob('active-old', JobStatus.QUEUED, '2026-07-23T10:00:00.000Z'),
      makeJob('latched', JobStatus.COMPLETED, '2026-07-23T11:00:00.000Z'),
      makeJob('active-new', JobStatus.RUNNING, '2026-07-23T12:00:00.000Z'),
      makeJob('history-new', JobStatus.FAILED, '2026-07-23T11:30:00.000Z'),
    ];

    const result = partitionSyncJobsForDisplay(jobs, ['latched', 'active-new'], 10);

    expect(result.featuredJobs.map((job) => job.id)).toEqual([
      'active-new',
      'latched',
      'active-old',
    ]);
    expect(result.historyJobs.map((job) => job.id)).toEqual(['history-new', 'history-old']);
  });

  it('keeps only the newest active job in the completed-job latch', () => {
    const jobs = [
      makeJob('active-old', JobStatus.QUEUED, '2026-07-23T10:00:00.000Z'),
      makeJob('active-new', JobStatus.RUNNING, '2026-07-23T12:00:00.000Z'),
    ];

    expect(getNextLatchedJobIds(jobs, ['previous'], 1)).toEqual(['active-new']);
  });
});
