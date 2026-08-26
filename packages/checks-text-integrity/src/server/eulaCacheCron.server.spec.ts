// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID,
  TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCHEDULE,
  getTextIntegrityEulaCacheRefreshCronStatus,
  installTextIntegrityEulaCacheRefreshCronJob,
} from './eulaCacheCron.server.js';

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
  resolveScopedCronTargetUrl: (...args: unknown[]) => mockResolveScopedCronTargetUrl(...args),
}));

describe('EULA cache refresh cron admin helpers', () => {
  beforeEach(() => {
    mockDbGetCronJob.mockReset();
    mockDbSeedBuiltinCronJob.mockReset();
    mockDbUpdateCronJob.mockReset();
    mockGetConfig.mockReset();
    mockResolveScopedCronTargetUrl.mockReset();
    mockGetConfig.mockResolvedValue({
      api: { url: 'https://example.test/v1' },
    });
    mockResolveScopedCronTargetUrl.mockReturnValue(
      'https://example.test/v1/hooks/text-integrity/eula-cache/refresh',
    );
  });

  it('reports not installed when CronJob row is missing', async () => {
    mockDbGetCronJob.mockResolvedValue(null);
    await expect(getTextIntegrityEulaCacheRefreshCronStatus()).resolves.toEqual({
      installed: false,
    });
    expect(mockDbGetCronJob).toHaveBeenCalledWith(TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID);
  });

  it('install seeds builtin cron with handshake auth', async () => {
    mockDbGetCronJob.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID,
      name: 'Text Integrity EULA cache refresh',
      schedule: TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCHEDULE,
      enabled: true,
      target_url: 'https://example.test/v1/hooks/text-integrity/eula-cache/refresh',
      target_scope: 'POST:/v1/hooks/text-integrity/eula-cache/refresh',
      last_run_at: null,
      last_status: null,
      next_run_at: '2026-07-01T12:00:00.000Z',
    });
    mockDbSeedBuiltinCronJob.mockResolvedValue(undefined);

    const status = await installTextIntegrityEulaCacheRefreshCronJob();
    expect(mockDbSeedBuiltinCronJob).toHaveBeenCalledWith(
      TEXT_INTEGRITY_EULA_CACHE_REFRESH_CRON_ID,
      expect.objectContaining({
        schedule: TEXT_INTEGRITY_EULA_CACHE_REFRESH_SCHEDULE,
        target_auth: 'HANDSHAKE',
        target_scope: 'POST:/v1/hooks/text-integrity/eula-cache/refresh',
      }),
    );
    expect(status.installed).toBe(true);
  });
});
