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
