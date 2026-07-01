// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import {
  getPmcLauncherErrorMessage,
  getPmcIncompleteCreateErrorMessage,
  getPmcLauncherDisplayErrorMessage,
  pmcDepositPath,
  buildPmcCreateDepositSuccessActionData,
  PMC_CREATE_DEPOSIT_INTENT,
  shouldAutoCreateDeposit,
  shouldNavigateToCreatedDeposit,
  shouldOpenDraftDialog,
  shouldShowPreparingSpinner,
  isPmcRoutesEnabled,
  type PmcLauncherActionData,
} from './pmcDepositLauncherState.js';

describe('getPmcLauncherErrorMessage', () => {
  it('returns null when there is no error', () => {
    expect(getPmcLauncherErrorMessage({ drafts: [] })).toBeNull();
    expect(getPmcLauncherErrorMessage(undefined)).toBeNull();
  });

  it('returns string errors as-is', () => {
    expect(getPmcLauncherErrorMessage({ error: 'Endpoint not found' })).toBe('Endpoint not found');
  });

  it('returns message from GeneralError objects', () => {
    expect(
      getPmcLauncherErrorMessage({
        error: { type: 'general', message: 'PMC site not found.' },
      }),
    ).toBe('PMC site not found.');
  });

  it('falls back when GeneralError message is empty or falsy', () => {
    expect(
      getPmcLauncherErrorMessage({
        error: { type: 'general', message: '' },
      }),
    ).toBe('Something went wrong. Please try again.');
    expect(
      getPmcLauncherErrorMessage({
        error: { type: 'general', message: 0 as unknown as string },
      }),
    ).toBe('Something went wrong. Please try again.');
  });

  it('falls back for structured errors without a message field', () => {
    expect(
      getPmcLauncherErrorMessage({
        error: { type: 'general' },
      } as PmcLauncherActionData),
    ).toBe('Something went wrong. Please try again.');
  });
});

describe('shouldOpenDraftDialog', () => {
  it('is true when drafts are present', () => {
    expect(
      shouldOpenDraftDialog({
        drafts: [{ workId: 'w1', submissionVersionId: 'sv1' } as never],
      }),
    ).toBe(true);
  });

  it('is false for empty drafts or errors', () => {
    expect(shouldOpenDraftDialog({ drafts: [] })).toBe(false);
    expect(shouldOpenDraftDialog({ error: { type: 'general', message: 'Failed' } })).toBe(false);
  });
});

describe('shouldAutoCreateDeposit', () => {
  it('auto-creates when get-drafts returned an empty list', () => {
    expect(shouldAutoCreateDeposit({ drafts: [] }, false)).toBe(true);
  });

  it('does not auto-create when drafts exist, create was submitted, or action errored', () => {
    expect(shouldAutoCreateDeposit({ drafts: [{ workId: 'w1' } as never] }, false)).toBe(false);
    expect(shouldAutoCreateDeposit({ drafts: [] }, true)).toBe(false);
    expect(shouldAutoCreateDeposit({ error: { type: 'general', message: 'Failed' } }, false)).toBe(
      false,
    );
  });
});

describe('shouldShowPreparingSpinner', () => {
  it('shows spinner while get-drafts or create fetcher requests are in flight', () => {
    expect(
      shouldShowPreparingSpinner({
        fetcherState: 'submitting',
        data: undefined,
        hasSubmittedCreate: false,
        dialogOpen: false,
      }),
    ).toBe(true);
    expect(
      shouldShowPreparingSpinner({
        fetcherState: 'loading',
        data: { drafts: [] },
        hasSubmittedCreate: true,
        dialogOpen: false,
      }),
    ).toBe(true);
  });

  it('shows spinner after empty get-drafts before create auto-submit runs', () => {
    expect(
      shouldShowPreparingSpinner({
        fetcherState: 'idle',
        data: { drafts: [] },
        hasSubmittedCreate: false,
        dialogOpen: false,
      }),
    ).toBe(true);
  });

  it('shows spinner after create auto-submit until navigation target is ready', () => {
    expect(
      shouldShowPreparingSpinner({
        fetcherState: 'idle',
        data: { drafts: [] },
        hasSubmittedCreate: true,
        dialogOpen: false,
      }),
    ).toBe(true);
    expect(
      shouldShowPreparingSpinner({
        fetcherState: 'idle',
        data: buildPmcCreateDepositSuccessActionData('w1', 'sv1'),
        hasSubmittedCreate: true,
        dialogOpen: false,
      }),
    ).toBe(true);
  });

  it('does not spin forever when create-deposit settled without navigation ids', () => {
    expect(
      shouldShowPreparingSpinner({
        fetcherState: 'idle',
        data: { intent: PMC_CREATE_DEPOSIT_INTENT, success: true },
        hasSubmittedCreate: true,
        dialogOpen: false,
      }),
    ).toBe(false);
  });

  it('shows the draft dialog shell when drafts exist and no work is in flight', () => {
    expect(
      shouldShowPreparingSpinner({
        fetcherState: 'idle',
        data: { drafts: [{ workId: 'w1', submissionVersionId: 'sv1' } as never] },
        hasSubmittedCreate: false,
        dialogOpen: true,
      }),
    ).toBe(false);
  });
});

describe('getPmcIncompleteCreateErrorMessage', () => {
  it('returns a fallback when create-deposit settled without navigable ids', () => {
    expect(
      getPmcIncompleteCreateErrorMessage(
        { intent: PMC_CREATE_DEPOSIT_INTENT, success: true },
        true,
      ),
    ).toBe('Something went wrong. Please try again.');
  });

  it('returns null while still waiting on get-drafts data', () => {
    expect(getPmcIncompleteCreateErrorMessage({ drafts: [] }, true)).toBeNull();
  });

  it('returns null when create-deposit succeeded with ids', () => {
    expect(
      getPmcIncompleteCreateErrorMessage(buildPmcCreateDepositSuccessActionData('w1', 'sv1'), true),
    ).toBeNull();
  });
});

describe('getPmcLauncherDisplayErrorMessage', () => {
  it('prefers explicit action errors over incomplete-create detection', () => {
    expect(
      getPmcLauncherDisplayErrorMessage(
        { intent: PMC_CREATE_DEPOSIT_INTENT, error: 'Endpoint not found' },
        true,
      ),
    ).toBe('Endpoint not found');
  });
});

describe('shouldNavigateToCreatedDeposit', () => {
  it('returns ids when create-deposit succeeded', () => {
    expect(
      shouldNavigateToCreatedDeposit(buildPmcCreateDepositSuccessActionData('w1', 'sv1')),
    ).toEqual({ workId: 'w1', submissionVersionId: 'sv1' });
  });

  it('returns null for get-drafts or incomplete create responses', () => {
    expect(shouldNavigateToCreatedDeposit({ drafts: [] })).toBeNull();
    expect(shouldNavigateToCreatedDeposit({ intent: 'create-deposit', success: false })).toBeNull();
  });
});

describe('pmcDepositPath', () => {
  it('builds the PMC deposit route', () => {
    expect(pmcDepositPath('w1', 'sv1')).toBe('/app/works/w1/site/pmc/deposit/sv1');
  });
});

describe('isPmcRoutesEnabled', () => {
  it('requires extensions.pmc.routes to be true', () => {
    expect(isPmcRoutesEnabled({ app: { extensions: { pmc: { routes: true } } } })).toBe(true);
    expect(isPmcRoutesEnabled({ app: { extensions: { pmc: { routes: false } } } })).toBe(false);
    expect(isPmcRoutesEnabled({ app: { extensions: { pmc: {} } } })).toBe(false);
    expect(isPmcRoutesEnabled({})).toBe(false);
  });
});
