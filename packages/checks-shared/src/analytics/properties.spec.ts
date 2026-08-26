import { describe, expect, it } from 'vitest';
import {
  computeDurationMs,
  normalizeChecksTrigger,
  resolveSourceFormat,
  sanitizeAnalyticsErrorMessage,
} from './properties.js';

describe('checks analytics properties', () => {
  it('sanitizes long error messages', () => {
    const long = 'x'.repeat(250);
    const result = sanitizeAnalyticsErrorMessage(long);
    expect(result).toHaveLength(200);
    expect(result?.endsWith('…')).toBe(true);
  });

  it('resolves source format from file flags', () => {
    expect(resolveSourceFormat(true, false)).toBe('pdf');
    expect(resolveSourceFormat(false, true)).toBe('docx');
    expect(resolveSourceFormat(true, true)).toBe('pdf_and_docx');
    expect(resolveSourceFormat(false, false)).toBeUndefined();
  });

  it('normalizes trigger values with fallback', () => {
    expect(normalizeChecksTrigger('upload')).toBe('upload');
    expect(normalizeChecksTrigger('latest_version')).toBe('latest_version');
    expect(normalizeChecksTrigger('')).toBe('checks_page');
    expect(normalizeChecksTrigger(undefined, 'cron')).toBe('cron');
  });

  it('computes duration from ISO timestamps', () => {
    const start = new Date(Date.now() - 5000).toISOString();
    const duration = computeDurationMs(start);
    expect(duration).toBeGreaterThanOrEqual(5000);
    expect(duration).toBeLessThan(6000);
  });
});
