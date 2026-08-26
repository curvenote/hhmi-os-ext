import { createExtensionCheckAnalyticsCatalog } from '@hhmi/checks-shared/analytics/events';

export const TEXT_INTEGRITY_SERVICE_DISPLAY_NAME = 'Text Integrity';

const catalog = createExtensionCheckAnalyticsCatalog(TEXT_INTEGRITY_SERVICE_DISPLAY_NAME);

export const TextIntegrityTrackEvent = catalog.events;
export const textIntegrityAnalyticsCatalog = catalog;
