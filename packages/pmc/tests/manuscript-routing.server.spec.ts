// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import {
  hasManuscriptHandoffOccurred,
  pickSubmissionVersionForManuscriptId,
} from '../src/backend/email/manuscript-routing.server.js';

describe('pickSubmissionVersionForManuscriptId', () => {
  const v = (id: string, status: string, date: string) => ({
    id,
    status,
    date_created: date,
  });

  it('returns undefined for empty list', () => {
    expect(pickSubmissionVersionForManuscriptId([])).toBeUndefined();
  });

  it('returns sole version even if draft', () => {
    expect(pickSubmissionVersionForManuscriptId([v('a', 'DRAFT', '2026-01-02')])?.id).toBe('a');
  });

  it('targets prior version while latest is pre-handoff', () => {
    const versions = [
      v('latest', 'DRAFT', '2026-02-01'),
      v('prior', 'REQUEST_NEW_VERSION', '2026-01-01'),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('prior');
  });

  it('targets prior version while latest is DEPOSITED', () => {
    const versions = [
      v('latest', 'DEPOSITED', '2026-02-01'),
      v('prior', 'REQUEST_NEW_VERSION', '2026-01-01'),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('prior');
  });

  it('targets latest once handoff status reached', () => {
    const versions = [
      v('latest', 'DEPOSIT_CONFIRMED_BY_PMC', '2026-02-01'),
      v('prior', 'REQUEST_NEW_VERSION', '2026-01-01'),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('latest');
  });

  it('targets latest when latest is REQUEST_NEW_VERSION after confirm path', () => {
    const versions = [
      v('latest', 'REQUEST_NEW_VERSION', '2026-03-01'),
      v('prior', 'REQUEST_NEW_VERSION', '2026-01-01'),
    ];
    expect(pickSubmissionVersionForManuscriptId(versions)?.id).toBe('latest');
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
});
