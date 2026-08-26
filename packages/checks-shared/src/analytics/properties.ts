export type ChecksKind = 'checks-text-integrity' | 'proofig';

export type ChecksAnalyticsTrigger =
  | 'upload'
  | 'checks_page'
  | 'latest_version'
  | 'retry'
  | 'admin'
  | 'cron'
  | 'integrity_page';

export type ChecksSourceFormat = 'pdf' | 'docx' | 'pdf_and_docx';

export type ChecksAnalyticsBase = {
  checkKind: ChecksKind;
  workId?: string;
  workVersionId: string;
  workVersionNumber?: number;
  checkRunId?: string;
  attempt?: number;
  retryOfRunId?: string;
  trigger?: ChecksAnalyticsTrigger;
  sourceFormat?: ChecksSourceFormat;
  path?: string;
  createdByUserId?: string;
  invokedByUserId?: string;
};

export type ChecksRunLifecycleProps = ChecksAnalyticsBase & {
  manifestVersion?: string;
  eulaVersion?: string;
  similarityScore?: number;
  hasPdfReport?: boolean;
  proofigState?: string;
  hasDocxConversion?: boolean;
  durationMs?: number;
  failureReason?: string;
};

export const MAX_ANALYTICS_ERROR_MESSAGE_LENGTH = 200;

export function sanitizeAnalyticsErrorMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const trimmed = message.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= MAX_ANALYTICS_ERROR_MESSAGE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_ANALYTICS_ERROR_MESSAGE_LENGTH - 1)}…`;
}

export function resolveSourceFormat(
  hasPdf: boolean,
  hasDocx: boolean,
): ChecksSourceFormat | undefined {
  if (hasPdf && hasDocx) return 'pdf_and_docx';
  if (hasPdf) return 'pdf';
  if (hasDocx) return 'docx';
  return undefined;
}

export function computeDurationMs(startIso: string | Date | null | undefined): number | undefined {
  if (!startIso) return undefined;
  const start = startIso instanceof Date ? startIso.getTime() : Date.parse(startIso);
  if (Number.isNaN(start)) return undefined;
  return Math.max(0, Date.now() - start);
}

export function normalizeChecksTrigger(
  raw: string | null | undefined,
  fallback: ChecksAnalyticsTrigger = 'checks_page',
): ChecksAnalyticsTrigger {
  const value = raw?.trim();
  if (
    value === 'upload' ||
    value === 'checks_page' ||
    value === 'latest_version' ||
    value === 'retry' ||
    value === 'admin' ||
    value === 'cron' ||
    value === 'integrity_page'
  ) {
    return value;
  }
  return fallback;
}

export function buildChecksRunStartedProps(base: ChecksRunLifecycleProps): Record<string, unknown> {
  return { ...base };
}

export function buildChecksRunStartFailedProps(
  base: ChecksRunLifecycleProps,
  failureReason: string,
): Record<string, unknown> {
  return {
    ...base,
    failureReason: sanitizeAnalyticsErrorMessage(failureReason),
  };
}
