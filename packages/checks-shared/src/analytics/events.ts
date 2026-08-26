import type { ExtensionAnalyticsEvents } from '@curvenote/scms-core';

/**
 * Stable catalog keys extensions expose via `getAnalyticsEvents().events`.
 * Platform upload and checks-page routes resolve Segment names per extension catalog.
 */
export const ExtensionCheckTrackEventKey = {
  CHECKS_UPLOAD_CONFIRMED: 'CHECKS_UPLOAD_CONFIRMED',
  CHECKS_PAGE_VIEWED: 'CHECKS_PAGE_VIEWED',
  CHECKS_RUN_STARTED: 'CHECKS_RUN_STARTED',
  CHECKS_RUN_START_FAILED: 'CHECKS_RUN_START_FAILED',
  CHECKS_RUN_COMPLETED: 'CHECKS_RUN_COMPLETED',
  CHECKS_RUN_FAILED: 'CHECKS_RUN_FAILED',
  CHECKS_RUN_RETRIED: 'CHECKS_RUN_RETRIED',
  CHECKS_REPORT_OPENED: 'CHECKS_REPORT_OPENED',
  CHECKS_PDF_DOWNLOADED: 'CHECKS_PDF_DOWNLOADED',
  CHECKS_PDF_REGENERATION_REQUESTED: 'CHECKS_PDF_REGENERATION_REQUESTED',
  CHECKS_RESULTS_DISPLAYED: 'CHECKS_RESULTS_DISPLAYED',
  CHECKS_EULA_STATUS_REQUESTED: 'CHECKS_EULA_STATUS_REQUESTED',
  CHECKS_EULA_DIALOG_OPENED: 'CHECKS_EULA_DIALOG_OPENED',
  CHECKS_EULA_ACCEPTED: 'CHECKS_EULA_ACCEPTED',
  CHECKS_EULA_DECLINED: 'CHECKS_EULA_DECLINED',
} as const;

export type ExtensionCheckTrackEventKey =
  (typeof ExtensionCheckTrackEventKey)[keyof typeof ExtensionCheckTrackEventKey];

export type ExtensionCheckTrackEvents = Record<ExtensionCheckTrackEventKey, string>;

function eventName(serviceDisplayName: string, action: string): string {
  return `${serviceDisplayName} ${action}`;
}

/** Build a per-check-service Segment catalog (e.g. "Text Integrity Run Started"). */
export function createExtensionCheckAnalyticsCatalog(
  serviceDisplayName: string,
): ExtensionAnalyticsEvents {
  const events: ExtensionCheckTrackEvents = {
    [ExtensionCheckTrackEventKey.CHECKS_UPLOAD_CONFIRMED]: eventName(
      serviceDisplayName,
      'Upload Confirmed',
    ),
    [ExtensionCheckTrackEventKey.CHECKS_PAGE_VIEWED]: eventName(serviceDisplayName, 'Page Viewed'),
    [ExtensionCheckTrackEventKey.CHECKS_RUN_STARTED]: eventName(serviceDisplayName, 'Run Started'),
    [ExtensionCheckTrackEventKey.CHECKS_RUN_START_FAILED]: eventName(
      serviceDisplayName,
      'Run Start Failed',
    ),
    [ExtensionCheckTrackEventKey.CHECKS_RUN_COMPLETED]: eventName(
      serviceDisplayName,
      'Run Completed',
    ),
    [ExtensionCheckTrackEventKey.CHECKS_RUN_FAILED]: eventName(serviceDisplayName, 'Run Failed'),
    [ExtensionCheckTrackEventKey.CHECKS_RUN_RETRIED]: eventName(serviceDisplayName, 'Run Retried'),
    [ExtensionCheckTrackEventKey.CHECKS_REPORT_OPENED]: eventName(
      serviceDisplayName,
      'Report Opened',
    ),
    [ExtensionCheckTrackEventKey.CHECKS_PDF_DOWNLOADED]: eventName(
      serviceDisplayName,
      'PDF Downloaded',
    ),
    [ExtensionCheckTrackEventKey.CHECKS_PDF_REGENERATION_REQUESTED]: eventName(
      serviceDisplayName,
      'PDF Regeneration Requested',
    ),
    [ExtensionCheckTrackEventKey.CHECKS_RESULTS_DISPLAYED]: eventName(
      serviceDisplayName,
      'Results Displayed',
    ),
    [ExtensionCheckTrackEventKey.CHECKS_EULA_STATUS_REQUESTED]: eventName(
      serviceDisplayName,
      'EULA Status Requested',
    ),
    [ExtensionCheckTrackEventKey.CHECKS_EULA_DIALOG_OPENED]: eventName(
      serviceDisplayName,
      'EULA Dialog Opened',
    ),
    [ExtensionCheckTrackEventKey.CHECKS_EULA_ACCEPTED]: eventName(
      serviceDisplayName,
      'EULA Accepted',
    ),
    [ExtensionCheckTrackEventKey.CHECKS_EULA_DECLINED]: eventName(
      serviceDisplayName,
      'EULA Declined',
    ),
  };

  const descriptions: Record<string, string> = {
    [events.CHECKS_UPLOAD_CONFIRMED]: `User confirmed upload with ${serviceDisplayName} selected for dispatch`,
    [events.CHECKS_PAGE_VIEWED]: `User viewed the ${serviceDisplayName} section on the work checks page`,
    [events.CHECKS_RUN_STARTED]: `${serviceDisplayName} run started and its job was enqueued`,
    [events.CHECKS_RUN_START_FAILED]: `${serviceDisplayName} run failed before submission (validation, missing files, EULA, etc.)`,
    [events.CHECKS_RUN_COMPLETED]: `${serviceDisplayName} run reached a terminal success state`,
    [events.CHECKS_RUN_FAILED]: `${serviceDisplayName} run reached a terminal failure state`,
    [events.CHECKS_RUN_RETRIED]: `A failed ${serviceDisplayName} run was retried with a new run`,
    [events.CHECKS_REPORT_OPENED]: `User opened a ${serviceDisplayName} report`,
    [events.CHECKS_PDF_DOWNLOADED]: `User downloaded a ${serviceDisplayName} PDF report`,
    [events.CHECKS_PDF_REGENERATION_REQUESTED]: `User requested regeneration of a ${serviceDisplayName} PDF report`,
    [events.CHECKS_RESULTS_DISPLAYED]: `${serviceDisplayName} results became visible in the checks section UI`,
    [events.CHECKS_EULA_STATUS_REQUESTED]: `${serviceDisplayName} EULA status was requested before enabling the check`,
    [events.CHECKS_EULA_DIALOG_OPENED]: `${serviceDisplayName} EULA dialog was shown`,
    [events.CHECKS_EULA_ACCEPTED]: `User accepted the ${serviceDisplayName} EULA`,
    [events.CHECKS_EULA_DECLINED]: `User closed the ${serviceDisplayName} EULA dialog without accepting`,
  };

  return { events, descriptions };
}
