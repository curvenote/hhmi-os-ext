// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import type { WorkflowTransition } from '@curvenote/scms-core';
import {
  getTransitionJobId,
  shouldPollJobTransition,
  resolveActiveTransitionAfterLoad,
} from './jobTransitionPolling.js';

function transition(overrides: Partial<WorkflowTransition> = {}): WorkflowTransition {
  return {
    name: 'send_to_pmc',
    requiresJob: true,
    state: { jobId: 'job-1' },
    labels: { inProgress: 'Depositing at PMC...' },
    ...overrides,
  } as WorkflowTransition;
}

describe('jobTransitionPolling', () => {
  it('reads jobId from transition state', () => {
    expect(getTransitionJobId(transition())).toBe('job-1');
    expect(getTransitionJobId(null)).toBeUndefined();
    expect(getTransitionJobId(transition({ state: {} }))).toBeUndefined();
  });

  it('polls only for unhandled job-backed transitions', () => {
    expect(shouldPollJobTransition(transition(), new Set())).toBe(true);
    expect(shouldPollJobTransition(transition(), new Set(['job-1']))).toBe(false);
    expect(shouldPollJobTransition(transition({ requiresJob: false }), new Set())).toBe(false);
    expect(shouldPollJobTransition(null, new Set())).toBe(false);
  });

  it('clears stale transitions for jobs already seen as terminal', () => {
    const incoming = transition();
    expect(resolveActiveTransitionAfterLoad(incoming, new Set())).toEqual(incoming);
    expect(resolveActiveTransitionAfterLoad(incoming, new Set(['job-1']))).toBeNull();
    expect(resolveActiveTransitionAfterLoad(null, new Set(['job-1']))).toBeNull();
  });
});
