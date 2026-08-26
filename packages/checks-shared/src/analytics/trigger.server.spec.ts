import { describe, expect, it } from 'vitest';
import {
  resolveChecksAnalyticsTrigger,
  resolveChecksAnalyticsTriggerFromArgs,
} from './trigger.server.js';

describe('resolveChecksAnalyticsTrigger', () => {
  it('reads trigger from form data', () => {
    const formData = new FormData();
    formData.set('trigger', 'latest_version');
    expect(resolveChecksAnalyticsTrigger({ intent: 'execute', formData })).toBe('latest_version');
  });

  it('maps retry intent when form trigger is absent', () => {
    expect(resolveChecksAnalyticsTrigger({ intent: 'retry' })).toBe('retry');
  });

  it('uses fallback for execute without trigger', () => {
    expect(resolveChecksAnalyticsTrigger({ intent: 'execute' }, 'checks_page')).toBe('checks_page');
  });
});

describe('resolveChecksAnalyticsTriggerFromArgs', () => {
  it('prefers explicit analyticsTrigger from upload dispatch', () => {
    expect(
      resolveChecksAnalyticsTriggerFromArgs(
        { intent: 'execute', workVersionId: 'wv-1', analyticsTrigger: 'upload' },
        'checks_page',
      ),
    ).toBe('upload');
  });
});
