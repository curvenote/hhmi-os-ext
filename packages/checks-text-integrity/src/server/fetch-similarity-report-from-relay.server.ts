import { httpError } from '@curvenote/scms-core';
import type { TextIntegrityDataSchema } from '../schema.js';
import {
  checksRelayReportFetchUrl,
  resolveRelayExternalCheckId,
  type AppChecksRelayConfig,
} from './relay-urls.server.js';
import { isPdfBytes } from './pdf-bytes.server.js';

export type FetchedSimilarityReportPdf = {
  bytes: Uint8Array;
  contentType: string;
  contentDisposition: string;
};

function retryAfterInit(relayRes: Response): ResponseInit | undefined {
  const retryAfter = relayRes.headers.get('retry-after');
  return retryAfter ? { headers: { 'Retry-After': retryAfter } } : undefined;
}

export async function fetchSimilarityReportPdfFromRelay(
  relay: AppChecksRelayConfig,
  serviceName: string,
  relayInstanceId: string,
  serviceData: TextIntegrityDataSchema,
): Promise<FetchedSimilarityReportPdf> {
  const relayBaseUrl = (relay.relayBaseUrl ?? '').trim().replace(/\/$/, '');
  const relayApiKey = (relay.relayApiKey ?? '').trim();
  if (!relayBaseUrl || !relayApiKey) {
    throw httpError(503, 'Checks relay is not configured (relayBaseUrl / relayApiKey)');
  }

  const pdfId = serviceData.reportPdfId ?? serviceData.latest?.reportPdfId;
  if (!pdfId) {
    throw httpError(400, 'No similarity PDF id stored for this run');
  }

  const externalId = resolveRelayExternalCheckId(serviceData);
  if (!externalId) {
    throw httpError(400, 'No external check id stored for this run');
  }

  const url = checksRelayReportFetchUrl(relayBaseUrl, serviceName, relayInstanceId, externalId);

  let relayRes: Response;
  try {
    relayRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${relayApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pdf_id: pdfId }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    throw httpError(502, e instanceof Error ? e.message : 'Failed to fetch PDF via checks relay');
  }

  const ct = relayRes.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    let body: Record<string, unknown> = {};
    try {
      body = (await relayRes.json()) as Record<string, unknown>;
    } catch {
      throw httpError(502, 'Checks relay returned invalid JSON for PDF fetch');
    }
    const msg =
      (typeof body.message === 'string' ? body.message : null) ??
      (typeof body.error === 'string' ? body.error : null) ??
      `Checks relay returned HTTP ${relayRes.status}`;
    throw httpError(
      relayRes.status >= 400 && relayRes.status < 600 ? relayRes.status : 502,
      msg,
      undefined,
      retryAfterInit(relayRes),
    );
  }

  if (!relayRes.ok) {
    throw httpError(
      relayRes.status >= 400 && relayRes.status < 600 ? relayRes.status : 502,
      `Checks relay returned HTTP ${relayRes.status}`,
      undefined,
      retryAfterInit(relayRes),
    );
  }

  const bytes = new Uint8Array(await relayRes.arrayBuffer());
  if (!isPdfBytes(bytes)) {
    throw httpError(502, 'Checks relay returned a non-PDF response for PDF fetch');
  }
  const contentType = ct && !ct.includes('json') ? ct : 'application/pdf';
  const contentDisposition =
    relayRes.headers.get('content-disposition') ?? 'attachment; filename="similarity-report.pdf"';

  return { bytes, contentType, contentDisposition };
}
