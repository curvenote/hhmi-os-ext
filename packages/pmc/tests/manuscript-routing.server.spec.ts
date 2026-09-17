// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import {
  hasManuscriptHandoffOccurred,
  pickSubmissionVersionForManuscriptId,
} from '../src/backend/email/manuscript-routing.server.js';

describe('pickSubmissionVersionForManuscriptId', () => {
  const v = (
    id: string,
    status: string,
    date: string,
    manuscriptConfirmed?: boolean,
  ) => ({
    id,
    status,
    date_created: date,
    ...(manuscriptConfirmed !== undefined ? { manuscriptConfirmed } : {}),
  });

  it('returns undefined for empty list', () => {
    expect(pickSubmissionVersionForManuscriptId([])).toBeUndefined();
  });

  it('returns sole version even if draft', () => {
    expect(pickSubmissionVersionForManuscriptId([v('a', 'DRAFT', '2026-01-02')])?.id).toBe('a');
  });

  it('targets prior version while latest is pre-handoff', () => {
    const versions = [
      v('latest', 'DRAFT', '2026-02-01', false),
      v('prior', 'REQUEST_NEW_VERSION', '2026-01-01', true),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('prior');
  });

  it('targets prior version while latest is DEPOSITED', () => {
    const versions = [
      v('latest', 'DEPOSITED', '2026-02-01', false),
      v('prior', 'REQUEST_NEW_VERSION', '2026-01-01', true),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('prior');
  });

  it('targets latest once handoff status reached', () => {
    const versions = [
      v('latest', 'DEPOSIT_CONFIRMED_BY_PMC', '2026-02-01', true),
      v('prior', 'REQUEST_NEW_VERSION', '2026-01-01', true),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('latest');
  });

  it('targets latest when latest is REQUEST_NEW_VERSION after confirm path', () => {
    const versions = [
      v('latest', 'REQUEST_NEW_VERSION', '2026-03-01', true),
      v('prior', 'REQUEST_NEW_VERSION', '2026-01-01', true),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('latest');
  });

  it('skips a failed middle redeposit and targets the last confirmed prior', () => {
    const versions = [
      v('sv3', 'DRAFT', '2026-03-01', false),
      v('sv2', 'DEPOSIT_FAILED', '2026-02-01', false),
      v('sv1', 'REQUEST_NEW_VERSION', '2026-01-01', true),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('sv1');
  });

  it('does not treat REQUEST_NEW_VERSION as handoff when never confirmed', () => {
    const versions = [
      v('sv2', 'REQUEST_NEW_VERSION', '2026-02-01', false),
      v('sv1', 'REQUEST_NEW_VERSION', '2026-01-01', true),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('sv1');
  });

  it('skips never-confirmed REQUEST_NEW_VERSION middle version when latest is draft', () => {
    const versions = [
      v('sv3', 'DRAFT', '2026-03-01', false),
      v('sv2', 'REQUEST_NEW_VERSION', '2026-02-01', false),
      v('sv1', 'REQUEST_NEW_VERSION', '2026-01-01', true),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('sv1');
  });
});

describe('hasManuscriptHandoffOccurred', () => {
  it('is false for DRAFT PENDING DEPOSITED', () => {
    expect(hasManuscriptHandoffOccurred('DRAFT')).toBe(false);
    expect(hasManuscriptHandoffOccurred('PENDING')).toBe(false);
    expect(hasManuscriptHandoffOccurred('DEPOSITED')).toBe(false);
  });

  it('is true for DEPOSIT_CONFIRMED_BY_PMC', () => {
    expect(hasManuscriptHandoffOccurred('DEPOSIT_CONFIRMED_BY_PMC')).toBe(true);
  });

  it('treats REQUEST_NEW_VERSION as handoff only when confirmed or legacy unset', () => {
    expect(hasManuscriptHandoffOccurred('REQUEST_NEW_VERSION')).toBe(true);
    expect(hasManuscriptHandoffOccurred('REQUEST_NEW_VERSION', true)).toBe(true);
    expect(hasManuscriptHandoffOccurred('REQUEST_NEW_VERSION', false)).toBe(false);
  });

  it('treats NO_ACTION_NEEDED as handoff only when confirmed or legacy unset', () => {
    expect(hasManuscriptHandoffOccurred('NO_ACTION_NEEDED')).toBe(true);
    expect(hasManuscriptHandoffOccurred('NO_ACTION_NEEDED', false)).toBe(false);
  });
});
