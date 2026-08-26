// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getConfig } from '@curvenote/scms-server';
import { runTextIntegrityRetrySweep } from './retrySweep.server.js';
import { EULA_ADMIN_RETRY_SKIP_MESSAGE } from './eula.server.js';
import { DEFAULT_TEXT_INTEGRITY_AUTO_RETRY } from './autoRetryPolicy.server.js';

const retrySweepMocks = vi.hoisted(() => {
  const mockFindMany = vi.fn();
  const mockClaim = vi.fn();
  const mockRelease = vi.fn();
  const mockRetry = vi.fn();
  const mockMarkNoAutoRetry = vi.fn();
  const defaultConfig = {
    api: { submissionsServiceAccount: { id: 'service-account' } },
    app: {
      extensions: { 'checks-text-integrity': {} as Record<string, unknown> },
    },
  };

  return {
    mockFindMany,
    mockClaim,
    mockRelease,
    mockRetry,
    mockMarkNoAutoRetry,
    defaultConfig,
    scmsServer: {
      getPrismaClient: vi.fn(async () => ({
        checkServiceRun: { findMany: mockFindMany },
      })),
      getConfig: vi.fn(async () => defaultConfig),
      CronJobTargetAuth: { HANDSHAKE: 'HANDSHAKE' },
      CronJobTargetType: { HTTP: 'HTTP' },
      dbGetCronJob: vi.fn(),
      dbSeedBuiltinCronJob: vi.fn(),
      dbUpdateCronJob: vi.fn(),
      resolveScopedCronTargetUrl: vi.fn(),
    },
  };
});

const { mockFindMany, mockClaim, mockRelease, mockRetry, mockMarkNoAutoRetry, defaultConfig } =
  retrySweepMocks;
const mockGetConfig = vi.mocked(getConfig);

vi.mock('@curvenote/scms-server', () => retrySweepMocks.scmsServer);

vi.mock('./config.server.js', () => ({
  getTextIntegrityConfigWithOverrides: vi.fn(async (base: Record<string, unknown>) => base),
}));

vi.mock('./runSuperseded.server.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    tryClaimTextIntegrityRunForRetrySweep: (...args: unknown[]) =>
      retrySweepMocks.mockClaim(...args),
    releaseTextIntegrityRunRetrySweepClaim: (...args: unknown[]) =>
      retrySweepMocks.mockRelease(...args),
  };
});

vi.mock('./retryCheckRun.server.js', () => ({
  retryTextIntegrityCheckRun: (...args: unknown[]) => retrySweepMocks.mockRetry(...args),
}));

vi.mock('./checkRunColumns.server.js', () => ({
  markCheckServiceRunNoAutoRetry: (...args: unknown[]) =>
    retrySweepMocks.mockMarkNoAutoRetry(...args),
}));

const sourceRun = {
  id: 'run-1',
  work_version_id: 'wv-1',
  attempt: 1,
  failed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  retry_of_id: null,
};

describe('runTextIntegrityRetrySweep', () => {
  beforeEach(() => {
    defaultConfig.app.extensions['checks-text-integrity'] = {
      autoRetry: DEFAULT_TEXT_INTEGRITY_AUTO_RETRY,
    };
    mockFindMany.mockReset();
    mockClaim.mockReset();
    mockRelease.mockReset();
    mockRetry.mockReset();
    mockMarkNoAutoRetry.mockReset();
    mockGetConfig.mockResolvedValue(defaultConfig as Awaited<ReturnType<typeof getConfig>>);
    mockFindMany.mockResolvedValue([sourceRun]);
    mockClaim.mockResolvedValue(true);
    mockMarkNoAutoRetry.mockResolvedValue(undefined);
    mockRelease.mockResolvedValue(undefined);
  });

  it('no-ops when autoRetry.enabled is false', async () => {
    mockGetConfig.mockResolvedValueOnce({
      ...defaultConfig,
      app: {
        extensions: {
          'checks-text-integrity': {
            autoRetry: { ...DEFAULT_TEXT_INTEGRITY_AUTO_RETRY, enabled: false },
          },
        },
      },
    } as Awaited<ReturnType<typeof getConfig>>);

    const result = await runTextIntegrityRetrySweep();

    expect(result).toEqual({
      scanned: 0,
      retried: 0,
      skippedClaimed: 0,
      skippedNotEligible: 0,
      skippedEula: 0,
      failed: 0,
      errors: [],
    });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('skips not-eligible runs when backoff has not elapsed', async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        ...sourceRun,
        failed_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
    ]);

    const result = await runTextIntegrityRetrySweep();

    expect(result.scanned).toBe(1);
    expect(result.skippedNotEligible).toBe(1);
    expect(result.retried).toBe(0);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('skips not-eligible runs when root retry window is exceeded via ancestor chain', async () => {
    const rootFailedAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const chainedRun = {
      id: 'run-3',
      work_version_id: 'wv-1',
      attempt: 3,
      failed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      retry_of_id: 'run-2',
    };

    mockFindMany
      .mockResolvedValueOnce([chainedRun])
      .mockResolvedValueOnce([{ id: 'run-2', retry_of_id: 'run-1', failed_at: rootFailedAt }])
      .mockResolvedValueOnce([{ id: 'run-1', retry_of_id: null, failed_at: rootFailedAt }]);

    const result = await runTextIntegrityRetrySweep();

    expect(result.scanned).toBe(1);
    expect(result.skippedNotEligible).toBe(1);
    expect(result.retried).toBe(0);
    expect(mockFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ['run-2'] } },
      }),
    );
    expect(mockFindMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: { id: { in: ['run-1'] } },
      }),
    );
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('uses the nearest known failed_at when a retry ancestor row is missing', async () => {
    const orphanFailedAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const chainedRun = {
      id: 'run-orphan',
      work_version_id: 'wv-1',
      attempt: 2,
      failed_at: orphanFailedAt,
      retry_of_id: 'missing-parent',
    };

    mockFindMany.mockResolvedValueOnce([chainedRun]).mockResolvedValueOnce([]);

    const result = await runTextIntegrityRetrySweep();

    expect(result.scanned).toBe(1);
    expect(result.skippedNotEligible).toBe(1);
    expect(result.retried).toBe(0);
    expect(mockFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ['missing-parent'] } },
      }),
    );
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('excludes runs with no_auto_retry from candidate query', async () => {
    mockRetry.mockResolvedValue({ success: true, checkRunId: 'run-2' });
    await runTextIntegrityRetrySweep();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ no_auto_retry: false }),
      }),
    );
  });

  it('does not pass scheduledAt — sweep timing is eligibility-only', async () => {
    mockRetry.mockResolvedValue({ success: true, checkRunId: 'run-2' });
    await runTextIntegrityRetrySweep();
    expect(mockRetry).toHaveBeenCalledWith(expect.anything(), 'wv-1', 'run-1', 'admin', {
      suppressSlack: true,
    });
  });

  it('marks no_auto_retry when admin retry skips for stale EULA', async () => {
    mockRetry.mockResolvedValue({
      status: 400,
      error: { message: EULA_ADMIN_RETRY_SKIP_MESSAGE },
      eulaSkip: true,
    });

    const result = await runTextIntegrityRetrySweep();
    expect(result.skippedEula).toBe(1);
    expect(mockMarkNoAutoRetry).toHaveBeenCalledWith('run-1');
    expect(mockRelease).toHaveBeenCalledWith('run-1');
  });

  it('counts mark-superseded failure as sweep failed, not retried', async () => {
    mockRetry.mockResolvedValue({
      status: 500,
      error: { message: 'Retry run exists but marking the source superseded failed.' },
      markSupersededFailed: true,
      checkRunId: 'run-2',
    });

    const result = await runTextIntegrityRetrySweep();
    expect(result.failed).toBe(1);
    expect(result.retried).toBe(0);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('waits for backoff after mark-superseded failure before reclaiming on next sweep', async () => {
    mockRetry.mockResolvedValue({
      status: 500,
      error: { message: 'mark failed' },
      markSupersededFailed: true,
      checkRunId: 'run-2',
    });

    await runTextIntegrityRetrySweep();
    expect(mockRetry).toHaveBeenCalledTimes(1);

    mockFindMany.mockResolvedValueOnce([
      {
        ...sourceRun,
        data: {
          sweepMeta: {
            markSupersededBackoffAt: new Date().toISOString(),
          },
        },
      },
    ]);
    mockRetry.mockClear();

    const second = await runTextIntegrityRetrySweep();
    expect(second.skippedNotEligible).toBe(1);
    expect(mockRetry).not.toHaveBeenCalled();
  });
});
