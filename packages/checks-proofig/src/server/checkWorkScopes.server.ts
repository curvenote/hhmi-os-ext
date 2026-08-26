import {
  assertWorkChecksReadForRun,
  createWorkCheckScopeGuard,
  rejectWorkChecksDispatch,
  rejectWorkChecksRead,
} from '@hhmi/checks-shared';

/** Intents that call Proofig or otherwise require work:checks:dispatch. */
export const PROOFIG_DISPATCH_INTENTS = new Set([
  'execute',
  'retry',
  'fetch-remote-status',
  'refresh-remote-status',
  'refresh-report-url',
  'hydrate-subimage-approval-status',
  'apply-notify-payload',
  'regenerate-pdf',
]);

export const guardProofigWorkCheckScopes = createWorkCheckScopeGuard(PROOFIG_DISPATCH_INTENTS);

export { assertWorkChecksReadForRun, rejectWorkChecksDispatch, rejectWorkChecksRead };
