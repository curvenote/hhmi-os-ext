import type { JobDTO } from '@curvenote/common';
import { JobStatus } from '@curvenote/scms-db';

export function isActiveSyncJob(job: JobDTO): boolean {
  return job.status === JobStatus.QUEUED || job.status === JobStatus.RUNNING;
}

export function isSyncControlDisabled(
  activeJobs: JobDTO[],
  fetcherState: string,
  optimisticJobId: string | null,
): boolean {
  return activeJobs.length > 0 || fetcherState !== 'idle' || optimisticJobId != null;
}

function sortNewestFirst(jobs: JobDTO[]): JobDTO[] {
  return [...jobs].sort((a, b) =>
    a.date_created < b.date_created ? 1 : a.date_created > b.date_created ? -1 : 0,
  );
}

export function getNextLatchedJobIds(
  jobs: JobDTO[],
  previousIds: string[],
  limit: number,
): string[] {
  const liveIds = new Set(jobs.map((job) => job.id));
  const livePreviousIds = previousIds.filter((id) => liveIds.has(id));
  const activeIds = sortNewestFirst(jobs.filter(isActiveSyncJob)).map((job) => job.id);
  const nextIds =
    activeIds.length === 0
      ? livePreviousIds.slice(0, limit)
      : [...new Set([...activeIds, ...livePreviousIds])].slice(0, limit);
  const isUnchanged =
    nextIds.length === previousIds.length &&
    nextIds.every((id, index) => id === previousIds[index]);
  return isUnchanged ? previousIds : nextIds;
}

export function partitionSyncJobsForDisplay(
  jobs: JobDTO[],
  latchedJobIds: string[],
  historyLimit: number,
): {
  activeJobs: JobDTO[];
  featuredJobs: JobDTO[];
  historyJobs: JobDTO[];
} {
  const activeJobs = sortNewestFirst(jobs.filter(isActiveSyncJob));
  const latchedJobs = latchedJobIds
    .map((id) => jobs.find((job) => job.id === id))
    .filter((job): job is JobDTO => job != null);
  const featuredJobs = sortNewestFirst([
    ...new Map([...activeJobs, ...latchedJobs].map((job) => [job.id, job])).values(),
  ]);
  const featuredJobIds = new Set(featuredJobs.map((job) => job.id));
  const historyJobs = sortNewestFirst(
    jobs.filter((job) => !isActiveSyncJob(job) && !featuredJobIds.has(job.id)),
  ).slice(0, historyLimit);

  return { activeJobs, featuredJobs, historyJobs };
}
