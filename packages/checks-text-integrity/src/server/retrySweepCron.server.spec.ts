// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
  getTextIntegrityRetrySweepCronStatus,
  installTextIntegrityRetrySweepCronJob,
} from './retrySweep.server.js';

const mockDbGetCronJob = vi.fn();
const mockDbSeedBuiltinCronJob = vi.fn();
const mockDbUpdateCronJob = vi.fn();
const mockGetConfig = vi.fn();
const mockResolveScopedCronTargetUrl = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  CronJobTargetAuth: { HANDSHAKE: 'HANDSHAKE' },
  CronJobTargetType: { HTTP: 'HTTP' },
  dbGetCronJob: (...args: unknown[]) => mockDbGetCronJob(...args),
  dbSeedBuiltinCronJob: (...args: unknown[]) => mockDbSeedBuiltinCronJob(...args),
  dbUpdateCronJob: (...args: unknown[]) => mockDbUpdateCronJob(...args),
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
  getPrismaClient: vi.fn(),
  resolveScopedCronTargetUrl: (...args: unknown[]) => mockResolveScopedCronTargetUrl(...args),
}));

vi.mock('./config.server.js', () => ({
  getTextIntegrityConfigWithOverrides: vi.fn(async (base: Record<string, unknown>) => base),
}));

vi.mock('./autoRetryPolicy.server.js', () => ({
  DEFAULT_TEXT_INTEGRITY_AUTO_RETRY: {
    enabled: true,
    backoff: {},
    limits: { maxAttempts: 20 },
    sweep: { limit: 25 },
  },
  getTextIntegrityAutoRetryConfig: vi.fn(() => ({
    enabled: true,
    backoff: {},
    limits: { maxAttempts: 20 },
    sweep: { limit: 25 },
  })),
}));

vi.mock('./runSuperseded.server.js', () => ({
  tryClaimTextIntegrityRunForRetrySweep: vi.fn(),
  releaseTextIntegrityRunRetrySweepClaim: vi.fn(),
}));

vi.mock('./retryCheckRun.server.js', () => ({
  retryTextIntegrityCheckRun: vi.fn(),
}));

vi.mock('./checkRunColumns.server.js', () => ({
  markCheckServiceRunNoAutoRetry: vi.fn(),
}));

describe('retry sweep cron admin helpers', () => {
  beforeEach(() => {
    mockDbGetCronJob.mockReset();
    mockDbSeedBuiltinCronJob.mockReset();
    mockDbUpdateCronJob.mockReset();
    mockGetConfig.mockReset();
    mockResolveScopedCronTargetUrl.mockReset();
    mockGetConfig.mockResolvedValue({
      api: {
        url: 'https://example.test/v1',
        tasksCallbackUrl: 'http://host.docker.internal:3031/v1',
      },
    });
    mockResolveScopedCronTargetUrl.mockReturnValue(
      'https://example.test/v1/hooks/text-integrity/retry-sweep',
    );
  });

  it('reports not installed when CronJob row is missing', async () => {
    mockDbGetCronJob.mockResolvedValue(null);
    await expect(getTextIntegrityRetrySweepCronStatus()).resolves.toEqual({ installed: false });
    expect(mockDbGetCronJob).toHaveBeenCalledWith(TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID);
  });

  it('maps installed CronJob fields for admin display', async () => {
    mockDbGetCronJob.mockResolvedValue({
      id: TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
      name: 'Text Integrity retry sweep',
      schedule: '*/5 * * * *',
      enabled: true,
      target_url: 'http://host.docker.internal:3031/v1',
      target_scope: 'POST:/v1/hooks/text-integrity/retry-sweep',
      last_run_at: '2026-07-01T12:00:00.000Z',
      last_status: 'SUCCESS',
      next_run_at: '2026-07-01T12:05:00.000Z',
    });
    mockDbUpdateCronJob.mockResolvedValue({
      id: TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
      name: 'Text Integrity retry sweep',
      schedule: '*/5 * * * *',
      enabled: true,
      target_url: 'https://example.test/v1/hooks/text-integrity/retry-sweep',
      target_scope: 'POST:/v1/hooks/text-integrity/retry-sweep',
      last_run_at: '2026-07-01T12:00:00.000Z',
      last_status: 'SUCCESS',
      next_run_at: '2026-07-01T12:05:00.000Z',
    });

    await expect(getTextIntegrityRetrySweepCronStatus()).resolves.toEqual({
      installed: true,
      cronJob: {
        id: TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
        name: 'Text Integrity retry sweep',
        schedule: '*/5 * * * *',
        enabled: true,
        targetUrl: 'https://example.test/v1/hooks/text-integrity/retry-sweep',
        targetScope: 'POST:/v1/hooks/text-integrity/retry-sweep',
        lastRunAt: '2026-07-01T12:00:00.000Z',
        lastStatus: 'SUCCESS',
        nextRunAt: '2026-07-01T12:05:00.000Z',
      },
    });
    expect(mockDbUpdateCronJob).toHaveBeenCalledWith(TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID, {
      target_url: 'https://example.test/v1/hooks/text-integrity/retry-sweep',
    });
  });

  it('keeps stored status when cron target scope cannot resolve yet', async () => {
    mockDbGetCronJob.mockResolvedValue({
      id: TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
      name: 'Text Integrity retry sweep',
      schedule: '*/5 * * * *',
      enabled: true,
      target_url: 'http://host.docker.internal:3031/v1',
      target_scope: 'POST:/v1/hooks/text-integrity/retry-sweep',
      last_run_at: null,
      last_status: null,
      next_run_at: null,
    });
    mockResolveScopedCronTargetUrl.mockImplementation(() => {
      throw new Error('HTTP cron missing target_url');
    });

    await expect(getTextIntegrityRetrySweepCronStatus()).resolves.toEqual({
      installed: true,
      cronJob: {
        id: TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
        name: 'Text Integrity retry sweep',
        schedule: '*/5 * * * *',
        enabled: true,
        targetUrl: 'http://host.docker.internal:3031/v1',
        targetScope: 'POST:/v1/hooks/text-integrity/retry-sweep',
        lastRunAt: null,
        lastStatus: null,
        nextRunAt: null,
      },
    });
    expect(mockDbUpdateCronJob).not.toHaveBeenCalled();
  });

  it('propagates failures while self-healing stale cron target URLs', async () => {
    mockDbGetCronJob.mockResolvedValue({
      id: TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
      name: 'Text Integrity retry sweep',
      schedule: '*/5 * * * *',
      enabled: true,
      target_url: 'http://host.docker.internal:3031/v1',
      target_scope: 'POST:/v1/hooks/text-integrity/retry-sweep',
      last_run_at: null,
      last_status: null,
      next_run_at: null,
    });
    mockDbUpdateCronJob.mockRejectedValue(new Error('database unavailable'));

    await expect(getTextIntegrityRetrySweepCronStatus()).rejects.toThrow('database unavailable');
  });

  it('install seeds builtin cron then returns status', async () => {
    mockDbGetCronJob.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
      name: 'Text Integrity retry sweep',
      schedule: '*/5 * * * *',
      enabled: true,
      target_url: 'https://example.test/v1/hooks/text-integrity/retry-sweep',
      target_scope: 'POST:/v1/hooks/text-integrity/retry-sweep',
      last_run_at: null,
      last_status: null,
      next_run_at: '2026-07-01T12:05:00.000Z',
    });
    mockDbSeedBuiltinCronJob.mockResolvedValue(undefined);

    const status = await installTextIntegrityRetrySweepCronJob();
    expect(mockResolveScopedCronTargetUrl).toHaveBeenCalledWith(
      'POST:/v1/hooks/text-integrity/retry-sweep',
      expect.objectContaining({
        url: 'https://example.test/v1',
        tasksCallbackUrl: 'http://host.docker.internal:3031/v1',
      }),
    );
    expect(mockDbSeedBuiltinCronJob).toHaveBeenCalledWith(
      TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
      expect.objectContaining({
        name: 'Text Integrity retry sweep',
        schedule: '*/5 * * * *',
        target_url: 'https://example.test/v1/hooks/text-integrity/retry-sweep',
        target_scope: 'POST:/v1/hooks/text-integrity/retry-sweep',
      }),
    );
    expect(status.installed).toBe(true);
  });

  it('install updates target_url when cron already exists', async () => {
    mockDbGetCronJob
      .mockResolvedValueOnce({
        id: TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
        target_url: 'http://host.docker.internal:3031/v1',
      })
      .mockResolvedValueOnce({
        id: TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
        name: 'Text Integrity retry sweep',
        schedule: '*/5 * * * *',
        enabled: true,
        target_url: 'https://example.test/v1/hooks/text-integrity/retry-sweep',
        target_scope: 'POST:/v1/hooks/text-integrity/retry-sweep',
        last_run_at: null,
        last_status: null,
        next_run_at: '2026-07-01T12:05:00.000Z',
      });
    mockDbUpdateCronJob.mockResolvedValue({});

    await installTextIntegrityRetrySweepCronJob();
    expect(mockDbSeedBuiltinCronJob).not.toHaveBeenCalled();
    expect(mockDbUpdateCronJob).toHaveBeenCalledWith(
      TEXT_INTEGRITY_RETRY_SWEEP_CRON_ID,
      expect.objectContaining({
        target_url: 'https://example.test/v1/hooks/text-integrity/retry-sweep',
        target_scope: 'POST:/v1/hooks/text-integrity/retry-sweep',
      }),
    );
  });
});
