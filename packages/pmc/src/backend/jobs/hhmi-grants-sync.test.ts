// eslint-disable-next-line import/no-extraneous-dependencies
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatus } from '@curvenote/scms-db';

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockUpdateMany = vi.fn();
const mockFormatJobDTO = vi.fn((_ctx, job) => job);
const mockUpdateHHMIScientists = vi.fn();
const mockFetch = vi.fn();
const mockGetAirtableApiKey = vi.fn();
let mockJobState: Record<string, any> | null;

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    job: { findMany: mockFindMany, findFirst: mockFindFirst, updateMany: mockUpdateMany },
  })),
  jobs: {
    formatJobDTO: mockFormatJobDTO,
  },
}));

vi.mock('../airtable-config.server.js', () => ({
  getAirtableApiKey: mockGetAirtableApiKey,
  getAirtableBaseId: vi.fn(async () => 'base-id'),
  getAirtableScientistsTableId: vi.fn(async () => 'table-id'),
  getAirtableScientistsViewId: vi.fn(async () => undefined),
  getAirtableScientistsGrantIdFieldId: vi.fn(async () => 'grant-id'),
  getAirtableScientistsOrcidFieldId: vi.fn(async () => 'orcid'),
  getAirtableScientistsFullNameFieldId: vi.fn(async () => 'full-name'),
  getAirtableScientistsFirstNamePreferredFieldId: vi.fn(async () => 'first-name-preferred'),
  getAirtableScientistsFirstNamePrimaryFieldId: vi.fn(async () => 'first-name-primary'),
  getAirtableScientistsLastNamePreferredFieldId: vi.fn(async () => 'last-name-preferred'),
  getAirtableScientistsEmailFieldId: vi.fn(async () => 'email'),
}));

vi.mock('../hhmi-grants.server.js', () => ({
  updateHHMIScientists: mockUpdateHHMIScientists,
}));

vi.stubGlobal('fetch', mockFetch);

const {
  HHMI_GRANTS_SYNC,
  conditionallyTerminalizeHhmiSyncJob,
  hhmiGrantsSyncHandler,
  invalidateOldHhmiSyncJobs,
  isHhmiSyncJobStale,
} = await import('./hhmi-grants-sync.js');

describe('HHMI grants sync jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateHHMIScientists.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));
    mockFindMany.mockResolvedValue([
      {
        id: 'queued-job',
        results: {},
        status: JobStatus.QUEUED,
        date_modified: '2026-07-23T11:54:00.000Z',
      },
      {
        id: 'running-job',
        results: {},
        status: JobStatus.RUNNING,
        date_modified: '2026-07-23T11:54:00.000Z',
      },
    ]);
    mockJobState = {
      id: 'job-1',
      status: JobStatus.QUEUED,
      date_modified: '2026-07-23T11:54:00.000Z',
    };
    mockFindFirst.mockImplementation(async ({ where }) =>
      mockJobState?.id === where.id ? mockJobState : null,
    );
    mockUpdateMany.mockImplementation(async ({ where, data }) => {
      const currentJob = mockJobState;
      if (
        currentJob &&
        currentJob.id === where.id &&
        [JobStatus.QUEUED, JobStatus.RUNNING].includes(currentJob.status) &&
        (!where.date_modified ||
          Date.parse(currentJob.date_modified) < Date.parse(where.date_modified.lt))
      ) {
        mockJobState = { ...currentJob, ...data };
        return { count: 1 };
      }
      return { count: 0 };
    });
    mockUpdateHHMIScientists.mockResolvedValue(undefined);
    mockGetAirtableApiKey.mockResolvedValue('api-key');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ records: [] }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails only stale queued and running sync jobs for the current site', async () => {
    await invalidateOldHhmiSyncJobs('site-1');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        job_type: HHMI_GRANTS_SYNC,
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        payload: { path: ['site_id'], equals: 'site-1' },
        date_modified: { lt: '2026-07-23T11:55:00.000Z' },
      },
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'queued-job',
          job_type: HHMI_GRANTS_SYNC,
          payload: { path: ['site_id'], equals: 'site-1' },
          status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
          date_modified: { lt: '2026-07-23T11:55:00.000Z' },
        },
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          messages: { push: 'Job timed out' },
        }),
      }),
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'running-job',
          job_type: HHMI_GRANTS_SYNC,
          payload: { path: ['site_id'], equals: 'site-1' },
          status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
          date_modified: { lt: '2026-07-23T11:55:00.000Z' },
        },
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          messages: { push: 'Job timed out' },
        }),
      }),
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('does not reap a job refreshed after the stale-job query', async () => {
    mockFindMany.mockImplementationOnce(async () => {
      mockJobState = {
        id: 'job-1',
        status: JobStatus.RUNNING,
        date_modified: '2026-07-23T11:59:00.000Z',
      };
      return [
        {
          id: 'job-1',
          results: {},
          status: JobStatus.RUNNING,
          date_modified: '2026-07-23T11:54:00.000Z',
        },
      ];
    });

    await invalidateOldHhmiSyncJobs('site-1');

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'job-1',
          job_type: HHMI_GRANTS_SYNC,
          payload: { path: ['site_id'], equals: 'site-1' },
          status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
          date_modified: { lt: '2026-07-23T11:55:00.000Z' },
        },
      }),
    );
    expect(await mockUpdateMany.mock.results[0].value).toEqual({ count: 0 });
    expect(mockJobState).toEqual(
      expect.objectContaining({
        status: JobStatus.RUNNING,
        date_modified: '2026-07-23T11:59:00.000Z',
      }),
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('does not update jobs when none are stale', async () => {
    mockFindMany.mockResolvedValue([]);

    await invalidateOldHhmiSyncJobs('site-1');

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('swallows stale-job query errors without updating jobs', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFindMany.mockRejectedValue(new Error('database unavailable'));

    await expect(invalidateOldHhmiSyncJobs('site-1')).resolves.toBeUndefined();

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Error invalidating old HHMI sync jobs:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('identifies only active jobs with stale modification times', () => {
    expect(
      isHhmiSyncJobStale({
        status: JobStatus.RUNNING,
        date_modified: '2026-07-23T11:54:59.999Z',
      }),
    ).toBe(true);
    expect(
      isHhmiSyncJobStale({
        status: JobStatus.QUEUED,
        date_modified: '2026-07-23T11:59:59.999Z',
      }),
    ).toBe(false);
    expect(
      isHhmiSyncJobStale({
        status: JobStatus.COMPLETED,
        date_modified: '2026-07-23T10:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('returns the updated job when terminalization wins', async () => {
    mockJobState = { id: 'job-1', status: JobStatus.RUNNING };

    const result = await conditionallyTerminalizeHhmiSyncJob(
      'job-1',
      'site-1',
      {
        status: JobStatus.COMPLETED,
        message: 'completed',
        results: { processedCount: 1 },
      },
      { includeJob: true },
    );

    expect(result).toEqual({
      count: 1,
      job: expect.objectContaining({ id: 'job-1', status: JobStatus.COMPLETED }),
    });
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it('returns the current job when terminalization loses', async () => {
    const cancelledJob = { id: 'job-1', status: JobStatus.CANCELLED };
    mockJobState = cancelledJob;

    const result = await conditionallyTerminalizeHhmiSyncJob(
      'job-1',
      'site-1',
      {
        status: JobStatus.COMPLETED,
        message: 'completed',
        results: { processedCount: 1 },
      },
      { includeJob: true },
    );

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: { path: ['site_id'], equals: 'site-1' },
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
      },
      data: expect.objectContaining({
        status: JobStatus.COMPLETED,
        messages: { push: 'completed' },
      }),
    });
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: { path: ['site_id'], equals: 'site-1' },
      },
    });
    expect(result).toEqual({ count: 0, job: cancelledJob });
  });

  it('returns only the update count when the current job is not requested', async () => {
    const result = await conditionallyTerminalizeHhmiSyncJob('job-1', 'site-1', {
      status: JobStatus.FAILED,
      message: 'timed out',
      results: {},
    });

    expect(result).toEqual({ count: 1 });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  describe('hhmiGrantsSyncHandler', () => {
    it.each([JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.COMPLETED])(
      'does not restart a job already in terminal status %s',
      async (status) => {
        const terminalJob = { id: 'terminal-job', status };
        mockJobState = terminalJob;

        const result = await hhmiGrantsSyncHandler({} as never, {
          id: 'terminal-job',
          job_type: HHMI_GRANTS_SYNC,
          payload: { site_id: 'site-1', sync_type: 'hhmi-scientists' },
        });

        expect(mockFormatJobDTO).toHaveBeenCalledWith({}, terminalJob);
        expect(result).toBe(terminalJob);
      },
    );

    it.each([null, undefined])('rejects a %s payload before querying Prisma', async (payload) => {
      await expect(
        hhmiGrantsSyncHandler(
          {} as never,
          {
            id: 'job-1',
            job_type: HHMI_GRANTS_SYNC,
            payload,
          } as never,
        ),
      ).rejects.toThrow('HHMI grants sync job site_id is required');

      expect(mockFindFirst).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it('rejects a missing site_id before querying Prisma', async () => {
      await expect(
        hhmiGrantsSyncHandler(
          {} as never,
          {
            id: 'job-1',
            job_type: HHMI_GRANTS_SYNC,
            payload: { sync_type: 'hhmi-scientists' },
          } as never,
        ),
      ).rejects.toThrow('HHMI grants sync job site_id is required');

      expect(mockFindFirst).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it.each([JobStatus.QUEUED, JobStatus.RUNNING])(
      'starts and completes a job whose stored status is %s',
      async (status) => {
        const activeJob = { id: 'job-1', status };
        mockJobState = activeJob;

        const result = await hhmiGrantsSyncHandler({} as never, {
          id: 'job-1',
          job_type: HHMI_GRANTS_SYNC,
          payload: { site_id: 'site-1', sync_type: 'hhmi-scientists' },
        });

        expect(mockUpdateMany).toHaveBeenCalledWith({
          where: {
            id: 'job-1',
            job_type: HHMI_GRANTS_SYNC,
            payload: { path: ['site_id'], equals: 'site-1' },
            status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
          },
          data: {
            date_modified: '2026-07-23T12:00:00.000Z',
            status: JobStatus.RUNNING,
            messages: { push: 'Fetching funding identifiers from Airtable' },
          },
        });
        expect(mockUpdateHHMIScientists).toHaveBeenCalledWith([], 'merge');
        expect(mockUpdateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: 'job-1',
              job_type: HHMI_GRANTS_SYNC,
              payload: { path: ['site_id'], equals: 'site-1' },
              status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
            },
            data: expect.objectContaining({ status: JobStatus.COMPLETED }),
          }),
        );
        expect(result).toEqual(
          expect.objectContaining({ id: 'job-1', status: JobStatus.COMPLETED }),
        );
      },
    );

    it('transforms paginated records and records processing counts', async () => {
      mockJobState = { id: 'job-1', status: JobStatus.RUNNING };
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            records: [
              {
                id: 'preferred-name',
                fields: {
                  'grant-id': 'HHMI-1',
                  orcid: '0000-0001',
                  'full-name': 'Ada Lovelace',
                  'first-name-preferred': 'Ada',
                  'first-name-primary': 'Augusta',
                  'last-name-preferred': 'Lovelace',
                  email: 'ada@example.org',
                },
              },
              {
                id: 'missing-grant',
                fields: {
                  'full-name': 'Missing Grant',
                },
              },
            ],
            offset: 'next-page',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            records: [
              {
                id: 'primary-name',
                fields: {
                  'grant-id': 'HHMI-2',
                  orcid: '0000-0002',
                  'full-name': 'Grace Hopper',
                  'first-name-preferred': '   ',
                  'first-name-primary': 'Grace',
                  'last-name-preferred': 'Hopper',
                  email: 'grace@example.org',
                },
              },
            ],
          }),
        });

      await hhmiGrantsSyncHandler({} as never, {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: { site_id: 'site-1', sync_type: 'hhmi-scientists' },
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toContain('offset=next-page');
      expect(mockUpdateHHMIScientists).toHaveBeenCalledWith(
        [
          {
            id: 'preferred-name',
            fullName: 'Ada Lovelace',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.org',
            grantId: 'HHMI-1',
            orcid: '0000-0001',
          },
          {
            id: 'primary-name',
            fullName: 'Grace Hopper',
            firstName: 'Grace',
            lastName: 'Hopper',
            email: 'grace@example.org',
            grantId: 'HHMI-2',
            orcid: '0000-0002',
          },
        ],
        'merge',
      );
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'job-1',
            job_type: HHMI_GRANTS_SYNC,
            payload: { path: ['site_id'], equals: 'site-1' },
            status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
          },
          data: expect.objectContaining({
            status: JobStatus.COMPLETED,
            results: expect.objectContaining({
              totalRecords: 3,
              processedCount: 3,
              validCount: 2,
              skippedCount: 1,
              errorCount: 0,
              errors: [],
              syncStrategy: 'merge',
            }),
          }),
        }),
      );
    });

    it.each(['merge', 'replace'] as const)(
      'forwards %s strategy to persistence and completed results',
      async (syncStrategy) => {
        const activeJob = { id: 'job-1', status: JobStatus.RUNNING };
        mockJobState = activeJob;
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            records: [
              {
                id: 'record-1',
                fields: {
                  'grant-id': 'grant-1',
                  'full-name': 'Scientist One',
                },
              },
            ],
          }),
        });
        await hhmiGrantsSyncHandler({} as never, {
          id: 'job-1',
          job_type: HHMI_GRANTS_SYNC,
          payload: { site_id: 'site-1', sync_type: 'hhmi-scientists', sync_strategy: syncStrategy },
        });

        expect(mockUpdateHHMIScientists).toHaveBeenCalledWith(
          [expect.objectContaining({ id: 'record-1', grantId: 'grant-1' })],
          syncStrategy,
        );
        expect(mockUpdateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: 'job-1',
              job_type: HHMI_GRANTS_SYNC,
              payload: { path: ['site_id'], equals: 'site-1' },
              status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
            },
            data: expect.objectContaining({
              status: JobStatus.COMPLETED,
              results: expect.objectContaining({ syncStrategy }),
            }),
          }),
        );
      },
    );

    it('accepts the legacy camelCase strategy payload', async () => {
      const activeJob = { id: 'job-1', status: JobStatus.RUNNING };
      mockJobState = activeJob;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          records: [
            {
              id: 'record-1',
              fields: {
                'grant-id': 'grant-1',
                'full-name': 'Scientist One',
              },
            },
          ],
        }),
      });
      await hhmiGrantsSyncHandler({} as never, {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: {
          site_id: 'site-1',
          sync_type: 'hhmi-scientists',
          syncStrategy: 'replace',
        },
      });

      expect(mockUpdateHHMIScientists).toHaveBeenCalledWith(expect.any(Array), 'replace');
    });

    it('fails an unknown strategy without persisting scientists', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const activeJob = { id: 'job-1', status: JobStatus.RUNNING };
      mockJobState = activeJob;

      const result = await hhmiGrantsSyncHandler({} as never, {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: {
          site_id: 'site-1',
          sync_type: 'hhmi-scientists',
          sync_strategy: 'unknown',
        },
      });

      expect(mockUpdateHHMIScientists).not.toHaveBeenCalled();
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'job-1',
            job_type: HHMI_GRANTS_SYNC,
            payload: { path: ['site_id'], equals: 'site-1' },
            status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
          },
          data: expect.objectContaining({
            status: JobStatus.FAILED,
            messages: { push: 'Funding Id sync failed: Invalid sync strategy' },
          }),
        }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 'job-1', status: JobStatus.FAILED }));
      consoleError.mockRestore();
    });

    it('refuses to replace funding data with an empty Airtable result', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const activeJob = { id: 'job-1', status: JobStatus.RUNNING };
      mockJobState = activeJob;

      const result = await hhmiGrantsSyncHandler({} as never, {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: {
          site_id: 'site-1',
          sync_type: 'hhmi-scientists',
          sync_strategy: 'replace',
        },
      });

      expect(mockUpdateHHMIScientists).not.toHaveBeenCalled();
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'job-1',
            job_type: HHMI_GRANTS_SYNC,
            payload: { path: ['site_id'], equals: 'site-1' },
            status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
          },
          data: expect.objectContaining({
            status: JobStatus.FAILED,
            messages: {
              push: 'Funding Id sync failed: Refusing to replace all funding data with an empty result set',
            },
          }),
        }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 'job-1', status: JobStatus.FAILED }));
      consoleError.mockRestore();
    });

    it('records the resolved strategy in failed results', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const activeJob = { id: 'job-1', status: JobStatus.RUNNING };
      mockJobState = activeJob;
      mockUpdateHHMIScientists.mockRejectedValueOnce(new Error('database unavailable'));

      await hhmiGrantsSyncHandler({} as never, {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: {
          site_id: 'site-1',
          sync_type: 'hhmi-scientists',
          sync_strategy: 'replace',
        },
      });

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'job-1',
            job_type: HHMI_GRANTS_SYNC,
            payload: { path: ['site_id'], equals: 'site-1' },
            status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
          },
          data: expect.objectContaining({
            status: JobStatus.FAILED,
            results: expect.objectContaining({ syncStrategy: 'replace' }),
          }),
        }),
      );
      consoleError.mockRestore();
    });

    it('preserves a terminal status reached while handling an error', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const queuedJob = { id: 'job-1', status: JobStatus.QUEUED };
      const timedOutJob = { id: 'job-1', status: JobStatus.FAILED };
      mockJobState = queuedJob;
      mockGetAirtableApiKey.mockImplementationOnce(async () => {
        mockJobState = timedOutJob;
        throw new Error('Airtable unavailable');
      });

      const result = await hhmiGrantsSyncHandler({} as never, {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: { site_id: 'site-1', sync_type: 'hhmi-scientists' },
      });

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'job-1',
            job_type: HHMI_GRANTS_SYNC,
            payload: { path: ['site_id'], equals: 'site-1' },
            status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
          },
          data: expect.objectContaining({ status: JobStatus.FAILED }),
        }),
      );
      expect(result).toBe(timedOutJob);
      consoleError.mockRestore();
    });

    it('stops without resurrecting a job the stale reaper already terminalized', async () => {
      const queuedJob = { id: 'job-1', status: JobStatus.QUEUED };
      const timedOutJob = { id: 'job-1', status: JobStatus.FAILED };
      mockJobState = queuedJob;
      mockFetch.mockImplementationOnce(async () => {
        mockJobState = timedOutJob;
        return {
          ok: true,
          json: async () => ({ records: [] }),
        };
      });

      const result = await hhmiGrantsSyncHandler({} as never, {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: { site_id: 'site-1', sync_type: 'hhmi-scientists' },
      });

      expect(mockUpdateHHMIScientists).not.toHaveBeenCalled();
      expect(mockUpdateMany.mock.calls.map(([call]) => call.data.status)).not.toContain(
        JobStatus.COMPLETED,
      );
      expect(result).toBe(timedOutJob);
    });

    it('stops before writing when the reaper terminalizes at the updating progress guard', async () => {
      const timedOutJob = { id: 'job-1', status: JobStatus.FAILED };
      mockJobState = { id: 'job-1', status: JobStatus.QUEUED };
      const defaultUpdateMany = mockUpdateMany.getMockImplementation();
      mockUpdateMany.mockImplementation(async (args) => {
        if (args.data.messages?.push?.startsWith('Updating funding identifiers')) {
          mockJobState = timedOutJob;
        }
        return defaultUpdateMany?.(args);
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [
            { id: 'record-1', fields: { 'grant-id': 'grant-1', 'full-name': 'Scientist' } },
          ],
        }),
      });

      const result = await hhmiGrantsSyncHandler({} as never, {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: { site_id: 'site-1', sync_type: 'hhmi-scientists' },
      });

      expect(mockUpdateHHMIScientists).not.toHaveBeenCalled();
      expect(mockUpdateMany.mock.calls.map(([call]) => call.data.status)).not.toContain(
        JobStatus.COMPLETED,
      );
      expect(result).toBe(timedOutJob);
    });

    it('returns timed-out status when the reaper wins after funding data is written', async () => {
      const timedOutJob = { id: 'job-1', status: JobStatus.FAILED };
      mockJobState = { id: 'job-1', status: JobStatus.RUNNING };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [
            { id: 'record-1', fields: { 'grant-id': 'grant-1', 'full-name': 'Scientist' } },
          ],
        }),
      });
      mockUpdateHHMIScientists.mockImplementation(async () => {
        mockJobState = timedOutJob;
      });

      const result = await hhmiGrantsSyncHandler({} as never, {
        id: 'job-1',
        job_type: HHMI_GRANTS_SYNC,
        payload: { site_id: 'site-1', sync_type: 'hhmi-scientists' },
      });

      expect(mockUpdateHHMIScientists).toHaveBeenCalled();
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: JobStatus.COMPLETED }),
        }),
      );
      await expect(
        mockUpdateMany.mock.results[mockUpdateMany.mock.results.length - 1]?.value,
      ).resolves.toEqual({ count: 0 });
      expect(result).toBe(timedOutJob);
    });

    it('fails immediately when the dispatched job row is missing', async () => {
      mockJobState = null;

      await expect(
        hhmiGrantsSyncHandler({} as never, {
          id: 'job-1',
          job_type: HHMI_GRANTS_SYNC,
          payload: { site_id: 'site-1', sync_type: 'hhmi-scientists' },
        }),
      ).rejects.toThrow('HHMI grants sync job job-1 not found');

      expect(mockUpdateMany).not.toHaveBeenCalled();
      expect(mockFormatJobDTO).not.toHaveBeenCalled();
    });

    it('does not attempt failed terminalization when completed job lookup returns null', async () => {
      mockJobState = { id: 'job-1', status: JobStatus.RUNNING };
      mockUpdateHHMIScientists.mockImplementation(async () => {
        mockFindFirst.mockResolvedValueOnce(null);
      });

      await expect(
        hhmiGrantsSyncHandler({} as never, {
          id: 'job-1',
          job_type: HHMI_GRANTS_SYNC,
          payload: { site_id: 'site-1', sync_type: 'hhmi-scientists' },
        }),
      ).rejects.toThrow('HHMI grants sync job job-1 not found');

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: JobStatus.COMPLETED }),
        }),
      );
      expect(mockUpdateMany.mock.calls.map(([call]) => call.data.status)).not.toContain(
        JobStatus.FAILED,
      );
      expect(mockFormatJobDTO).not.toHaveBeenCalled();
    });
  });
});
