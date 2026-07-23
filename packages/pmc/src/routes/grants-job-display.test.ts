// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { JobStatus } from '@curvenote/scms-db';
import type { JobDTO } from '@curvenote/common';
import {
  getCancellationOutcome,
  getNextLatchedJobIds,
  isSyncControlDisabled,
  partitionSyncJobsForDisplay,
} from './grants-job-display.js';

function makeJob(id: string, status: JobStatus, dateCreated: string): JobDTO {
  return {
    id,
    status,
    date_created: dateCreated,
  } as JobDTO;
}

describe('funding sync job display', () => {
  it('shows a cancellation-lost note only after the action settles', () => {
    expect(getCancellationOutcome('idle', { success: true, cancelled: false })).toBe(
      'Job could not be cancelled because it already finished.',
    );
    expect(getCancellationOutcome('submitting', { success: true, cancelled: false })).toBeNull();
    expect(getCancellationOutcome('idle', { success: true, cancelled: true })).toBeNull();
    expect(getCancellationOutcome('idle', undefined)).toBeNull();
  });

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

  it('preserves latch identity when the active jobs are unchanged', () => {
    const jobs = [makeJob('active-new', JobStatus.RUNNING, '2026-07-23T12:00:00.000Z')];
    const previousIds = ['active-new'];

    expect(getNextLatchedJobIds(jobs, previousIds, 1)).toBe(previousIds);
  });

  it('keeps a completed job latched after it stops being active', () => {
    const completed = makeJob('done', JobStatus.COMPLETED, '2026-07-23T12:00:00.000Z');
    const previousIds = ['done'];

    expect(getNextLatchedJobIds([completed], previousIds, 1)).toBe(previousIds);
  });

  it('truncates completed latch ids to the limit', () => {
    const jobs = [
      makeJob('done-new', JobStatus.COMPLETED, '2026-07-23T12:00:00.000Z'),
      makeJob('done-old', JobStatus.COMPLETED, '2026-07-23T11:00:00.000Z'),
    ];

    expect(getNextLatchedJobIds(jobs, ['done-new', 'done-old'], 1)).toEqual(['done-new']);
  });

  it('prunes completed latch ids that are no longer loaded', () => {
    const completed = makeJob('loaded', JobStatus.COMPLETED, '2026-07-23T12:00:00.000Z');

    expect(getNextLatchedJobIds([completed], ['missing'], 1)).toEqual([]);
  });

  it('enables sync after the featured job completes', () => {
    const completed = makeJob('completed', JobStatus.COMPLETED, '2026-07-23T12:00:00.000Z');
    const { activeJobs, featuredJobs } = partitionSyncJobsForDisplay(
      [completed],
      ['completed'],
      10,
    );

    expect(featuredJobs).toEqual([completed]);
    expect(isSyncControlDisabled(activeJobs, 'idle', null)).toBe(false);
  });

  it('keeps sync disabled while work is active or being submitted', () => {
    const running = makeJob('running', JobStatus.RUNNING, '2026-07-23T12:00:00.000Z');

    expect(isSyncControlDisabled([running], 'idle', null)).toBe(true);
    expect(isSyncControlDisabled([], 'submitting', null)).toBe(true);
    expect(isSyncControlDisabled([], 'idle', 'optimistic-job')).toBe(true);
  });
});
