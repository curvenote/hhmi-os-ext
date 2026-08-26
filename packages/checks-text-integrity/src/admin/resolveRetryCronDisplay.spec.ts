// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { resolveRetryCronDisplaySnapshot } from './resolveRetryCronDisplay.js';

const installedCron = {
  installed: true as const,
  cronJob: {
    id: 'text-integrity-retry-sweep',
    name: 'Text Integrity retry sweep',
    schedule: '*/5 * * * *',
    enabled: true,
    targetUrl: 'https://example.test/retry-sweep',
    targetScope: 'text-integrity.retry-sweep',
    lastRunAt: null,
    lastStatus: null,
    nextRunAt: '2026-07-01T12:00:00.000Z',
  },
};

const disabledCron = {
  installed: true as const,
  cronJob: {
    ...installedCron.cronJob!,
    enabled: false,
    schedule: '0 * * * *',
  },
};

describe('resolveRetryCronDisplaySnapshot', () => {
  it('uses status when both fetchers report installed', () => {
    expect(resolveRetryCronDisplaySnapshot(disabledCron, installedCron)).toBe(disabledCron);
  });

  it('prefers install snapshot only during the post-install refresh window', () => {
    expect(resolveRetryCronDisplaySnapshot({ installed: false }, installedCron, true)).toBe(
      installedCron,
    );
  });

  it('uses status not-installed after refresh even when install data is stale', () => {
    expect(resolveRetryCronDisplaySnapshot({ installed: false }, installedCron, false)).toEqual({
      installed: false,
    });
  });

  it('falls back to install when status is missing', () => {
    expect(resolveRetryCronDisplaySnapshot(undefined, installedCron)).toBe(installedCron);
  });

  it('uses status after refresh replaces stale not-installed snapshot', () => {
    expect(resolveRetryCronDisplaySnapshot(installedCron, installedCron)).toBe(installedCron);
  });
});
