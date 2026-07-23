import type { JobDTO } from '@curvenote/common';
import { JobStatus } from '@curvenote/scms-db';

export function isActiveSyncJob(job: JobDTO): boolean {
  return job.status === JobStatus.QUEUED || job.status === JobStatus.RUNNING;
}

function sortNewestFirst(jobs: JobDTO[]): JobDTO[] {
  return [...jobs].sort((a, b) => b.date_created.localeCompare(a.date_created));
}

export function getNextLatchedJobIds(
  jobs: JobDTO[],
  previousIds: string[],
  limit: number,
): string[] {
  const activeIds = sortNewestFirst(jobs.filter(isActiveSyncJob)).map((job) => job.id);
  if (activeIds.length === 0) return previousIds.slice(0, limit);
  return [...new Set([...activeIds, ...previousIds])].slice(0, limit);
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
