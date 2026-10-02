// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import {
  correlateNihmsRecords,
  normalizeManuscriptId,
  type WorkspaceVersion,
} from '../src/backend/nihms-correlate.js';
import type { NihmsRecord } from '../src/backend/nihms-api.server.js';

const LOOKUP = {
  'Manuscript Removed from Processing': 'REMOVED_FROM_PROCESSING',
  'NIHMS Submission Review and File Preparation': 'REVIEWER_APPROVED_INITIAL',
};

const nihms = (nihmsId: string, extra: Partial<NihmsRecord> = {}): NihmsRecord => ({
  nihmsId,
  title: `Manuscript ${nihmsId}`,
  ...extra,
});

const version = (id: string, extra: Partial<WorkspaceVersion> = {}): WorkspaceVersion => ({
  submissionVersionId: `sv-${id}`,
  submissionId: 'sub-1',
  status: 'DEPOSITED',
  dateCreated: '2026-09-01T00:00:00.000Z',
  workVersionId: `wv-${id}`,
  workId: 'work-1',
  ...extra,
});

describe('normalizeManuscriptId', () => {
  it('strips an NIHMS prefix and whitespace', () => {
    expect(normalizeManuscriptId('NIHMS2213692')).toBe('2213692');
    expect(normalizeManuscriptId(' nihms 2213692 ')).toBe('2213692');
    expect(normalizeManuscriptId('2213692')).toBe('2213692');
  });

  it('returns undefined for empty values', () => {
    expect(normalizeManuscriptId(undefined)).toBeUndefined();
    expect(normalizeManuscriptId('  ')).toBeUndefined();
  });
});

describe('correlateNihmsRecords', () => {
  it('matches by package ID (bulk-submission-id = WorkVersion id)', () => {
    const [r] = correlateNihmsRecords(
      [nihms('100', { packageId: 'wv-a' })],
      [version('a')],
      LOOKUP,
    );
    expect(r.versions.map((v) => [v.submissionVersionId, v.match])).toEqual([['sv-a', 'package']]);
    expect(r.flags.unmatched).toBe(false);
  });

  it('matches by stored manuscript ID with or without the NIHMS prefix', () => {
    const records = [nihms('100'), nihms('200')];
    const versions = [
      version('a', { manuscriptId: 'NIHMS100', workId: 'w1' }),
      version('b', { manuscriptId: '200', workId: 'w2' }),
    ];
    const [r1, r2] = correlateNihmsRecords(records, versions, LOOKUP);
    expect(r1.versions[0]).toMatchObject({ submissionVersionId: 'sv-a', match: 'manuscript' });
    expect(r2.versions[0]).toMatchObject({ submissionVersionId: 'sv-b', match: 'manuscript' });
  });

  it('tags a version matching both ways as package+manuscript', () => {
    const [r] = correlateNihmsRecords(
      [nihms('100', { packageId: 'wv-a' })],
      [version('a', { manuscriptId: '100' })],
      LOOKUP,
    );
    expect(r.versions[0].match).toBe('package+manuscript');
  });

  it('nests every version of the matched work, newest first', () => {
    const [r] = correlateNihmsRecords(
      [nihms('100', { packageId: 'wv-a' })],
      [
        version('a', { dateCreated: '2026-09-09T00:00:00.000Z' }),
        version('b', { dateCreated: '2026-09-29T00:00:00.000Z', status: 'DRAFT' }),
        version('other', { workId: 'work-2' }),
      ],
      LOOKUP,
    );
    expect(r.versions.map((v) => [v.submissionVersionId, v.match])).toEqual([
      ['sv-b', 'same-work'],
      ['sv-a', 'package'],
    ]);
  });

  it('flags NIHMS records with no Workspace match', () => {
    const [r] = correlateNihmsRecords(
      [nihms('100', { packageId: 'wv-x' })],
      [version('a')],
      LOOKUP,
    );
    expect(r.flags.unmatched).toBe(true);
    expect(r.versions).toEqual([]);
    expect(r.flags.duplicate).toBe(false);
    expect(r.flags.statusDiffers).toBe(false);
  });

  it('flags duplicates when one work maps to more than one NIHMS record', () => {
    const records = [
      nihms('2213692', { packageId: 'wv-b' }),
      nihms('2209788', { packageId: 'wv-a' }),
      nihms('999', { packageId: 'wv-c' }),
    ];
    const versions = [
      version('a', { dateCreated: '2026-09-09T00:00:00.000Z' }),
      version('b', { dateCreated: '2026-09-29T00:00:00.000Z' }),
      version('c', { workId: 'work-2' }),
    ];
    const [newer, older, single] = correlateNihmsRecords(records, versions, LOOKUP);
    expect(newer.flags.duplicate).toBe(true);
    expect(older.flags.duplicate).toBe(true);
    expect(single.flags.duplicate).toBe(false);
    expect(newer.versions).toHaveLength(2);
  });

  it('compares the mapped NIHMS status with the directly matched version', () => {
    const versions = [
      version('a', { status: 'REQUEST_NEW_VERSION', dateCreated: '2026-09-09T00:00:00.000Z' }),
      version('b', {
        status: 'REVIEWER_APPROVED_INITIAL',
        dateCreated: '2026-09-29T00:00:00.000Z',
      }),
    ];
    const [removed, active] = correlateNihmsRecords(
      [
        nihms('2209788', {
          packageId: 'wv-a',
          currentStatus: 'Manuscript Removed from Processing',
        }),
        nihms('2213692', {
          packageId: 'wv-b',
          currentStatus: 'NIHMS Submission Review and File Preparation',
        }),
      ],
      versions,
      LOOKUP,
    );
    expect(removed).toMatchObject({
      mappedStatus: 'REMOVED_FROM_PROCESSING',
      comparedVersionId: 'sv-a',
      flags: { statusDiffers: true },
    });
    expect(active).toMatchObject({
      mappedStatus: 'REVIEWER_APPROVED_INITIAL',
      comparedVersionId: 'sv-b',
      flags: { statusDiffers: false },
    });
  });

  it('does not flag a status difference when the NIHMS status is unmapped', () => {
    const [r] = correlateNihmsRecords(
      [nihms('100', { packageId: 'wv-a', currentStatus: 'Pending Final Citation Data' })],
      [version('a')],
      LOOKUP,
    );
    expect(r.mappedStatus).toBeUndefined();
    expect(r.flags.statusDiffers).toBe(false);
  });
});
