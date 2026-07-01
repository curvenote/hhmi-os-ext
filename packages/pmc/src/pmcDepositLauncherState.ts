import type { GeneralError } from '@curvenote/scms-core';
import type { DraftPMCDeposit } from './backend/db.server.js';

export type PmcLauncherActionData =
  | {
      error?: GeneralError | string;
      drafts?: DraftPMCDeposit[];
      intent?: string;
      success?: boolean;
      workId?: string;
      submissionVersionId?: string;
    }
  | undefined;

export const PMC_CREATE_DEPOSIT_INTENT = 'create-deposit';

export type PmcCreateDepositSuccessActionData = {
  success: true;
  intent: typeof PMC_CREATE_DEPOSIT_INTENT;
  workId: string;
  submissionVersionId: string;
};

export function buildPmcCreateDepositSuccessActionData(
  workId: string,
  submissionVersionId: string,
): PmcCreateDepositSuccessActionData {
  return {
    success: true,
    intent: PMC_CREATE_DEPOSIT_INTENT,
    workId,
    submissionVersionId,
  };
}

export function pmcDepositPath(workId: string, submissionVersionId: string): string {
  return `/app/works/${workId}/site/pmc/deposit/${submissionVersionId}`;
}

export function shouldNavigateToCreatedDeposit(data: PmcLauncherActionData): {
  workId: string;
  submissionVersionId: string;
} | null {
  if (
    data?.intent === PMC_CREATE_DEPOSIT_INTENT &&
    data.success &&
    data.workId &&
    data.submissionVersionId
  ) {
    return { workId: data.workId, submissionVersionId: data.submissionVersionId };
  }
  return null;
}

export function getPmcLauncherErrorMessage(data: PmcLauncherActionData): string | null {
  if (!data?.error) return null;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.error === 'object' && 'message' in data.error) {
    return data.error.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** Error when create-deposit settled without a navigable target (e.g. missing ids). */
export function getPmcIncompleteCreateErrorMessage(
  data: PmcLauncherActionData,
  hasSubmittedCreate: boolean,
): string | null {
  if (!hasSubmittedCreate || !data) return null;
  if (data.intent !== PMC_CREATE_DEPOSIT_INTENT) return null;
  if (shouldNavigateToCreatedDeposit(data)) return null;
  return 'Something went wrong. Please try again.';
}

export function getPmcLauncherDisplayErrorMessage(
  data: PmcLauncherActionData,
  hasSubmittedCreate: boolean,
): string | null {
  return (
    getPmcLauncherErrorMessage(data) ?? getPmcIncompleteCreateErrorMessage(data, hasSubmittedCreate)
  );
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

/** True while the launcher should show the preparing spinner instead of the draft dialog shell. */
export function shouldShowPreparingSpinner(opts: {
  fetcherState: 'idle' | 'submitting' | 'loading';
  data: PmcLauncherActionData;
  hasSubmittedCreate: boolean;
  dialogOpen: boolean;
}): boolean {
  const { fetcherState, data, hasSubmittedCreate, dialogOpen } = opts;

  if (fetcherState !== 'idle') return true;
  if (shouldNavigateToCreatedDeposit(data)) return true;
  if (shouldAutoCreateDeposit(data, hasSubmittedCreate)) return true;
  if (
    hasSubmittedCreate &&
    !dialogOpen &&
    !getPmcLauncherDisplayErrorMessage(data, hasSubmittedCreate) &&
    data?.intent !== PMC_CREATE_DEPOSIT_INTENT
  ) {
    return true;
  }
  return false;
}

export function isPmcRoutesEnabled(config: {
  app?: { extensions?: { pmc?: { routes?: boolean } } };
}): boolean {
  return config.app?.extensions?.pmc?.routes === true;
}
