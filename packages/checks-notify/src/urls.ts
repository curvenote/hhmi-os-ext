/**
 * Canonical app paths for HHMI check deep links (Slack, email, etc.).
 *
 * These live in the checks module because they encode knowledge specific to
 * the check features (work integrity, text-integrity PDFs). Core must stay
 * agnostic of individual check kinds.
 */

/** App-router path to work integrity checks for a work. */
export function workIntegrityAppPath(workId: string) {
  return `/app/works/${workId}/work-integrity`;
}

export function asWorkIntegrityUrl(asBaseUrl: (path: string) => string, workId?: string) {
  if (!workId) return undefined;
  return asBaseUrl(workIntegrityAppPath(workId));
}

/** App-router path to download a text-integrity similarity PDF for a check run. */
export function textIntegrityPdfDownloadAppPath(checkRunId: string) {
  return `/app/checks-text-integrity/download-pdf/${checkRunId}`;
}

export function asTextIntegrityPdfDownloadUrl(
  asBaseUrl: (path: string) => string,
  checkRunId?: string,
) {
  if (!checkRunId) return undefined;
  return asBaseUrl(textIntegrityPdfDownloadAppPath(checkRunId));
}
