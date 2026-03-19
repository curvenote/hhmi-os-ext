import { getJournalInfo } from '../src/backend/jobs/pmc-deposit.js';
import type { JournalInfo } from '../src/backend/jobs/types.js';
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, vi } from 'vitest';

describe('getJournalInfo', () => {
  const journals: JournalInfo[] = [
    {
      id: 1,
      journalTitle: 'Nature Methods',
      pissn: '1234-5678',
      eissn: '8765-4321',
      nlmta: 'NAT METH',
      startDate: '2004-01-01',
    },
    {
      id: 2,
      journalTitle: 'Science Advances',
      pissn: '1111-2222',
      eissn: '3333-4444',
      nlmta: 'SCI ADV',
      startDate: '2015-01-01',
    },
  ];

  it('matches by ISSN and type (print)', () => {
    const pmc = { journalName: 'Nature Methods', issn: '1234-5678', issnType: 'print' as const };
    const result = getJournalInfo(journals, pmc);
    expect(result).toEqual({ issn: '1234-5678', issnType: 'print', title: 'Nature Methods' });
  });

  it('matches by ISSN and type (electronic)', () => {
    const pmc = {
      journalName: 'Nature Methods',
      issn: '8765-4321',
      issnType: 'electronic' as const,
    };
    const result = getJournalInfo(journals, pmc);
    expect(result).toEqual({ issn: '8765-4321', issnType: 'electronic', title: 'Nature Methods' });
  });

  it('logs a warning if ISSN matches but name does not', () => {
    const pmc = { journalName: 'Wrong Name', issn: '1234-5678', issnType: 'print' as const };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = getJournalInfo(journals, pmc);
    expect(result).toEqual({ issn: '1234-5678', issnType: 'print', title: 'Wrong Name' });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "PMC Deposit: ISSN match found but journal name differs. Metadata: 'Wrong Name', List: 'Nature Methods'",
      ),
    );
    warnSpy.mockRestore();
  });

  it('falls back to name match if ISSN not present', () => {
    const pmc = { journalName: 'Science Advances' };
    const result = getJournalInfo(journals, pmc);
    expect(result).toEqual({ issn: '1111-2222', issnType: 'print', title: 'Science Advances' });
  });

  it('throws if no match is found', () => {
    const pmc = { journalName: 'Nonexistent Journal' };
    expect(() => getJournalInfo(journals, pmc)).toThrow(
      'Journal info not found for Nonexistent Journal',
    );
  });

  it('throws if ISSN matches but journal has no ISSN', () => {
    const journalsWithNoIssn: JournalInfo[] = [
      { id: 3, journalTitle: 'No ISSN Journal', nlmta: 'NOISSN', startDate: '2020-01-01' },
    ];
    const pmc = { journalName: 'No ISSN Journal' };
    expect(() => getJournalInfo(journalsWithNoIssn, pmc)).toThrow(
      'No ISSN found for journal No ISSN Journal',
    );
  });
});
