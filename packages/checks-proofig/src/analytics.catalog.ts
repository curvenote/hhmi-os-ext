import { createExtensionCheckAnalyticsCatalog } from '@hhmi/checks-shared/analytics/events';

export const IMAGE_INTEGRITY_SERVICE_DISPLAY_NAME = 'Image Integrity';

const catalog = createExtensionCheckAnalyticsCatalog(IMAGE_INTEGRITY_SERVICE_DISPLAY_NAME);

export const ImageIntegrityTrackEvent = catalog.events;
export const imageIntegrityAnalyticsCatalog = catalog;
