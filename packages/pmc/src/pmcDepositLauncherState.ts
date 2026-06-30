import type { GeneralError } from '@curvenote/scms-core';
import type { DraftPMCDeposit } from './backend/db.server.js';

export type PmcLauncherActionData =
  | {
      error?: GeneralError | string;
      drafts?: DraftPMCDeposit[];
      intent?: string;
      success?: boolean;
    }
  | undefined;

export function getPmcLauncherErrorMessage(data: PmcLauncherActionData): string | null {
  if (!data?.error) return null;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.error === 'object' && 'message' in data.error) {
    return data.error.message;
  }
  return 'Something went wrong. Please try again.';
}

/** True when the user has draft deposits to choose from. */
export function shouldOpenDraftDialog(data: PmcLauncherActionData): boolean {
  return Array.isArray(data?.drafts) && data.drafts.length > 0;
}

/**
 * True when get-drafts succeeded with an empty list and we should auto-create a deposit.
 * Skips when the action returned an error or create was already submitted.
 */
export function shouldAutoCreateDeposit(
  data: PmcLauncherActionData,
  hasSubmittedCreate: boolean,
): boolean {
  if (hasSubmittedCreate) return false;
  if (getPmcLauncherErrorMessage(data)) return false;
  return Array.isArray(data?.drafts) && data.drafts.length === 0;
}

export function isPmcRoutesEnabled(config: {
  app?: { extensions?: { pmc?: { routes?: boolean } } };
}): boolean {
  return config.app?.extensions?.pmc?.routes === true;
}
