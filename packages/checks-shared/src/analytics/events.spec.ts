import { describe, expect, it } from 'vitest';
import { ExtensionCheckTrackEventKey, createExtensionCheckAnalyticsCatalog } from './events.js';

describe('createExtensionCheckAnalyticsCatalog', () => {
  it('prefixes Segment event names with the check service display name', () => {
    const catalog = createExtensionCheckAnalyticsCatalog('Text Integrity');
    expect(catalog.events[ExtensionCheckTrackEventKey.CHECKS_RUN_STARTED]).toBe(
      'Text Integrity Run Started',
    );
    expect(catalog.events[ExtensionCheckTrackEventKey.CHECKS_PAGE_VIEWED]).toBe(
      'Text Integrity Page Viewed',
    );
  });

  it('does not mention HHMI in event names', () => {
    const catalog = createExtensionCheckAnalyticsCatalog('Image Integrity');
    for (const eventName of Object.values(catalog.events)) {
      expect(eventName).not.toMatch(/HHMI/i);
      expect(eventName.startsWith('Image Integrity ')).toBe(true);
    }
  });
});
