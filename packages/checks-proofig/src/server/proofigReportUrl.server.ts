/**
 * Proofig report links use a `token` query parameter (see Proofig harness / notify `report_url`).
 * Replace it with a freshly issued access token while preserving path, host, and other params (e.g. `id`).
 */
export function proofigReportUrlWithAccessToken(
  storedReportUrl: string,
  accessToken: string,
): string {
  let url: URL;
  try {
    url = new URL(storedReportUrl);
  } catch {
    throw new Error('Stored Proofig report URL is not a valid absolute URL');
  }
  url.searchParams.set('token', accessToken);
  return url.toString();
}

/**
 * Local-dev helper for the PDF Docker worker: rewrite loopback report hosts to
 * `host.docker.internal` so Playwright inside the container can reach the Proofig
 * UI on the host. Does not change stored check-run URLs — apply only on the
 * dispatched payload when `pdfService.devLocalPushUrl` is configured.
 */
export function rewriteReportUrlForDockerWorker(reportUrl: string): string {
  let url: URL;
  try {
    url = new URL(reportUrl);
  } catch {
    throw new Error('Proofig report URL is not a valid absolute URL');
  }
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.hostname = 'host.docker.internal';
  }
  return url.toString();
}
