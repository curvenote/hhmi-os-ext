import type { ExtensionCheckHandleActionArgs } from '@curvenote/scms-core';
import { normalizeChecksTrigger, type ChecksAnalyticsTrigger } from './properties.js';

export function resolveChecksAnalyticsTrigger(
  args: Pick<ExtensionCheckHandleActionArgs, 'formData' | 'intent'>,
  fallback: ChecksAnalyticsTrigger = 'checks_page',
): ChecksAnalyticsTrigger {
  const fromForm = args.formData?.get('trigger')?.toString();
  if (fromForm) return normalizeChecksTrigger(fromForm, fallback);

  const intent = args.intent?.trim().toLowerCase() ?? '';
  if (intent.includes('retry')) return 'retry';

  return fallback;
}

/** Upload flow invokes execute without formData; platform passes this trigger explicitly. */
export function resolveChecksAnalyticsTriggerFromArgs(
  args: ExtensionCheckHandleActionArgs & { analyticsTrigger?: ChecksAnalyticsTrigger | string },
  fallback: ChecksAnalyticsTrigger = 'checks_page',
): ChecksAnalyticsTrigger {
  if (args.analyticsTrigger) {
    return normalizeChecksTrigger(args.analyticsTrigger, fallback);
  }
  return resolveChecksAnalyticsTrigger(args, fallback);
}
