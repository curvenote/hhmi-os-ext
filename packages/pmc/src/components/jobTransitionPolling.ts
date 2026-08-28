import type { WorkflowTransition } from '@curvenote/scms-core';

export function getTransitionJobId(
  transition: WorkflowTransition | null | undefined,
): string | undefined {
  const jobId = transition?.state?.jobId;
  return typeof jobId === 'string' && jobId.length > 0 ? jobId : undefined;
}

/**
 * Whether the admin UI should poll `/v1/jobs/:id` for an in-progress transition.
 * Once a job reaches a terminal status we never poll it again — even if the
 * submission version still has a stale `transition` (e.g. putStatus failed).
 */
export function shouldPollJobTransition(
  transition: WorkflowTransition | null | undefined,
  handledTerminalJobIds: ReadonlySet<string>,
): boolean {
  if (!transition?.requiresJob) return false;
  const jobId = getTransitionJobId(transition);
  if (!jobId) return false;
  if (handledTerminalJobIds.has(jobId)) return false;
  return true;
}

/**
 * Active transition to show after loader data arrives.
 * Suppresses stale transitions for jobs the UI already saw as COMPLETED/FAILED.
 */
export function resolveActiveTransitionAfterLoad(
  incoming: WorkflowTransition | null | undefined,
  handledTerminalJobIds: ReadonlySet<string>,
): WorkflowTransition | null {
  if (!incoming) return null;
  const jobId = getTransitionJobId(incoming);
  if (jobId && handledTerminalJobIds.has(jobId)) return null;
  return incoming;
}

export type StuckTransitionCheckOutcome = 'pending' | 'cleared' | 'stuck';

/**
 * After a COMPLETED job we toast success immediately. Separately, detect a stuck
 * transition only after loader/revalidate epochs have advanced enough that we're
 * not looking at stale props (and not racing putStatus vs COMPLETED visibility).
 */
export function decideStuckTransitionCheck(opts: {
  completedJobId: string;
  loaderTransition: WorkflowTransition | null | undefined;
  loaderEpochAtComplete: number;
  currentLoaderEpoch: number;
  /** Epochs that must elapse while the jobId is still present before "stuck" (default 2). */
  minEpochsForStuck?: number;
}): StuckTransitionCheckOutcome {
  const {
    completedJobId,
    loaderTransition,
    loaderEpochAtComplete,
    currentLoaderEpoch,
    minEpochsForStuck = 2,
  } = opts;

  if (getTransitionJobId(loaderTransition) !== completedJobId) {
    return 'cleared';
  }

  const epochsElapsed = currentLoaderEpoch - loaderEpochAtComplete;
  if (epochsElapsed < minEpochsForStuck) {
    return 'pending';
  }

  return 'stuck';
}
