import {
  assertWorkChecksReadForRun,
  createWorkCheckScopeGuard,
  rejectWorkChecksDispatch,
  rejectWorkChecksRead,
} from '@hhmi/checks-shared';

/** Intents that call the relay / provider and require work:checks:dispatch. */
export const TEXT_INTEGRITY_DISPATCH_INTENTS = new Set([
  'accept-eula',
  'execute',
  'retry',
  'refresh-viewer-url',
  'relay-status',
  'restart-similarity-pdf',
]);

export const guardTextIntegrityWorkCheckScopes = createWorkCheckScopeGuard(
  TEXT_INTEGRITY_DISPATCH_INTENTS,
);

export { assertWorkChecksReadForRun, rejectWorkChecksDispatch, rejectWorkChecksRead };
