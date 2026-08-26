import { getProofingToken, invalidateProofingTokenCache } from './proofigAuth.server.js';

const STATUS_PATH = '/api/status';

/**
 * POST Proofig submission status (same response shape as notify webhook payload).
 * Resolves a Proofig Bearer token (cached in `Object` when valid) before the status request.
 * Uses the same apiBaseUrl as submit (`…/ej` → POST `…/ej/api/status`).
 */
export async function postProofigRemoteStatus(
  apiBaseUrl: string,
  mergedConfig: Record<string, unknown>,
  reportId: string,
): Promise<{ ok: true; body: unknown } | { ok: false; message: string; statusCode?: number }> {
  const base = apiBaseUrl.replace(/\/$/, '');
  const url = `${base}${STATUS_PATH}`;
  let token: string;
  try {
    token = await getProofingToken(apiBaseUrl, mergedConfig);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Proofig authentication failed',
    };
  }

  const statusHeaders = (bearer: string) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer}`,
  });
  const statusBody = JSON.stringify({ report_id: reportId });

  let response = await fetch(url, {
    method: 'POST',
    headers: statusHeaders(token),
    body: statusBody,
  });

  if (response.status === 401) {
    await invalidateProofingTokenCache(apiBaseUrl, mergedConfig);
    try {
      token = await getProofingToken(apiBaseUrl, mergedConfig);
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Proofig authentication failed after 401',
      };
    }
    response = await fetch(url, {
      method: 'POST',
      headers: statusHeaders(token),
      body: statusBody,
    });
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    return {
      ok: false,
      message: `Proofig status API returned non-JSON (${response.status}): ${text.slice(0, 200)}`,
      statusCode: response.status,
    };
  }

  if (!response.ok) {
    const msg =
      (body != null && typeof body === 'object' && 'error_message' in body
        ? String((body as { error_message?: string }).error_message)
        : null) ?? text.slice(0, 300);
    return {
      ok: false,
      message: `Proofig status API error ${response.status}: ${msg || response.statusText}`,
      statusCode: response.status,
    };
  }

  return { ok: true, body };
}
