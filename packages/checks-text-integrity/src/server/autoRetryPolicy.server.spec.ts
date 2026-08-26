// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEXT_INTEGRITY_AUTO_RETRY,
  delayBeforeRetryMs,
  getTextIntegrityAutoRetryConfig,
  isTextIntegrityRunAutoRetryEligible,
} from './autoRetryPolicy.server.js';

describe('getTextIntegrityAutoRetryConfig', () => {
  it('returns documented defaults when autoRetry is missing', () => {
    expect(getTextIntegrityAutoRetryConfig(undefined)).toEqual(DEFAULT_TEXT_INTEGRITY_AUTO_RETRY);
  });

  it('merges partial overrides', () => {
    expect(
      getTextIntegrityAutoRetryConfig({
        autoRetry: {
          enabled: false,
          limits: { maxAttempts: 5 },
        },
      }),
    ).toMatchObject({
      enabled: false,
      limits: { maxAttempts: 5 },
    });
  });
});

describe('delayBeforeRetryMs', () => {
  const backoff = DEFAULT_TEXT_INTEGRITY_AUTO_RETRY.backoff;

  it('uses fixed interval for phase 1 attempts', () => {
    expect(delayBeforeRetryMs(1, backoff)).toBe(600_000);
    expect(delayBeforeRetryMs(3, backoff)).toBe(600_000);
  });

  it('exponential backoff after fixed phase with 12h cap', () => {
    expect(delayBeforeRetryMs(4, backoff)).toBe(3_600_000);
    expect(delayBeforeRetryMs(5, backoff)).toBe(7_200_000);
    expect(delayBeforeRetryMs(8, backoff)).toBe(43_200_000);
  });
});

describe('isTextIntegrityRunAutoRetryEligible', () => {
  const config = DEFAULT_TEXT_INTEGRITY_AUTO_RETRY;
  const rootFailedAt = '2026-07-01T00:00:00.000Z';

  it('rejects when delay since failure has not elapsed', () => {
    const failedAt = '2026-07-01T00:05:00.000Z';
    expect(
      isTextIntegrityRunAutoRetryEligible(
        { attempt: 1, failed_at: failedAt },
        rootFailedAt,
        config,
        Date.parse('2026-07-01T00:14:00.000Z'),
      ),
    ).toBe(false);
  });

  it('accepts after fixed interval and within retry window', () => {
    const failedAt = '2026-07-01T00:05:00.000Z';
    expect(
      isTextIntegrityRunAutoRetryEligible(
        { attempt: 1, failed_at: failedAt },
        rootFailedAt,
        config,
        Date.parse('2026-07-01T00:16:00.000Z'),
      ),
    ).toBe(true);
  });

  it('rejects after max retry window from root failure', () => {
    expect(
      isTextIntegrityRunAutoRetryEligible(
        { attempt: 1, failed_at: '2026-07-04T00:05:00.000Z' },
        rootFailedAt,
        config,
        Date.parse('2026-07-04T01:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('uses mark-superseded backoff without extending maxRetryWindowSec', () => {
    const failedAt = '2026-07-01T00:05:00.000Z';
    const markBackoffAt = '2026-07-04T00:00:00.000Z';

    expect(
      isTextIntegrityRunAutoRetryEligible(
        {
          attempt: 1,
          failed_at: failedAt,
          data: { sweepMeta: { markSupersededBackoffAt: markBackoffAt } },
        },
        rootFailedAt,
        config,
        Date.parse('2026-07-04T00:16:00.000Z'),
      ),
    ).toBe(false);
  });

  it('delays retry using mark-superseded backoff anchor', () => {
    const failedAt = '2026-07-01T00:05:00.000Z';
    const markBackoffAt = '2026-07-01T00:14:00.000Z';

    expect(
      isTextIntegrityRunAutoRetryEligible(
        {
          attempt: 1,
          failed_at: failedAt,
          data: { sweepMeta: { markSupersededBackoffAt: markBackoffAt } },
        },
        failedAt,
        config,
        Date.parse('2026-07-01T00:20:00.000Z'),
      ),
    ).toBe(false);

    expect(
      isTextIntegrityRunAutoRetryEligible(
        {
          attempt: 1,
          failed_at: failedAt,
          data: { sweepMeta: { markSupersededBackoffAt: markBackoffAt } },
        },
        failedAt,
        config,
        Date.parse('2026-07-01T00:25:00.000Z'),
      ),
    ).toBe(true);
  });
});
