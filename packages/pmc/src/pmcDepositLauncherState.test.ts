// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import {
  getPmcLauncherErrorMessage,
  shouldAutoCreateDeposit,
  shouldOpenDraftDialog,
  isPmcRoutesEnabled,
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

describe('isPmcRoutesEnabled', () => {
  it('requires extensions.pmc.routes to be true', () => {
    expect(isPmcRoutesEnabled({ app: { extensions: { pmc: { routes: true } } } })).toBe(true);
    expect(isPmcRoutesEnabled({ app: { extensions: { pmc: { routes: false } } } })).toBe(false);
    expect(isPmcRoutesEnabled({ app: { extensions: { pmc: {} } } })).toBe(false);
    expect(isPmcRoutesEnabled({})).toBe(false);
  });
});
