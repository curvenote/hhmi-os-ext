import { httpError, coerceToObject } from '@curvenote/scms-core';
import type { WorkVersionPayload, WorkVersionMetadataPayload } from '@curvenote/common';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

export const rollingLogEntry = (message: string, data: unknown) => ({ message, data });

/** Normalize to ISO string (data layer may give Date; we always want string in the payload). */
export function isoString(value: string | Date | null): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : (value as Date).toISOString();
}

/**
 * Map workVersion row to WorkVersionPayload (snake_case).
 * Dates are normalized to ISO strings so the payload always has string dates.
 */
export function workVersionToPayload(row: {
  id: string;
  work_id: string;
  date_created: string | Date;
  date_modified: string | Date;
  draft: boolean;
  cdn: string | null;
  cdn_key: string | null;
  title: string;
  description: string | null;
  authors: unknown;
  author_details: unknown;
  date: string | Date | null;
  doi: string | null;
  canonical: boolean | null;
  metadata: unknown;
  occ: number;
}): WorkVersionPayload {
  const metadata = row.metadata != null ? coerceToObject(row.metadata) : null;
  if (!metadata || typeof metadata !== 'object') {
    throw httpError(
      422,
      `Work version ${row.id} has no metadata; Proofig submit requires metadata.files`,
    );
  }
  const authors = Array.isArray(row.authors) ? row.authors : [];
  const authorDetails = Array.isArray(row.author_details) ? row.author_details : [];
  return {
    id: row.id,
    work_id: row.work_id,
    date_created: isoString(row.date_created) ?? '',
    date_modified: isoString(row.date_modified) ?? '',
    draft: row.draft,
    cdn: row.cdn,
    cdn_key: row.cdn_key,
    title: row.title,
    description: row.description,
    authors: authors as string[],
    author_details: authorDetails,
    date: isoString(row.date),
    doi: row.doi,
    canonical: row.canonical,
    metadata: metadata as WorkVersionMetadataPayload,
    occ: row.occ,
  };
}

export type FileEntry = {
  signedUrl?: string;
  name?: string;
  path?: string;
  type?: string;
  // Allow additional properties from metadata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

type WorkVersionMetadataWithFiles = WorkVersionMetadataPayload & {
  files?: Record<string, FileEntry>;
};

function hasPdfFile(files: Record<string, FileEntry> | undefined): FileEntry | null {
  if (!files || typeof files !== 'object') return null;
  const entries = Object.values(files);
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const type = entry.type?.toLowerCase?.();
    const name = (entry.name ?? entry.path ?? '')?.toLowerCase?.();
    const isPdf =
      type === 'application/pdf' ||
      (typeof name === 'string' && (name.endsWith('.pdf') || name === 'pdf'));
    if (isPdf && entry.signedUrl) return entry;
  }
  return null;
}

export function getPdfFileFromMetadata(
  metadata: WorkVersionMetadataPayload | null,
  workVersionId: string,
): FileEntry {
  const meta = metadata as WorkVersionMetadataWithFiles | null;
  const pdf = hasPdfFile(meta?.files);
  if (!pdf) {
    throw httpError(
      422,
      `Work version ${workVersionId} metadata.files does not contain a PDF file with signedUrl`,
    );
  }
  return pdf;
}

export type ProofigSubmitParams = {
  submit_req_id: string;
  title: string;
  journal: string;
  authors: string;
  identifier: string;
  notes: string;
  filename: string;
  notify_url: string;
};

export function buildProofigSubmitParams(
  payload: { submit_req_id: string; notify_url: string; workVersion: WorkVersionPayload },
  pdfFilename: string,
): ProofigSubmitParams {
  const wv = payload.workVersion;
  const filename = pdfFilename.endsWith('.pdf') ? pdfFilename : `${pdfFilename}.pdf`;
  return {
    submit_req_id: payload.submit_req_id,
    title: wv.title ?? 'Anonymized Title',
    journal: 'HHMI Workspace',
    authors: !wv.authors || wv.authors.length === 0 ? 'Anonymous' : wv.authors.join(', '),
    identifier: wv.id,
    notes: 'Uploaded from HHMI Workspace',
    filename,
    notify_url: payload.notify_url,
  };
}

export type ProofigSubmitResponse = {
  report_id?: string;
  status?: string;
  error_message?: string;
};

export async function postToProofigStream(
  baseUrl: string,
  params: ProofigSubmitParams,
  pdfResponse: Response,
  pdfFilename: string,
  accessToken: string,
): Promise<ProofigSubmitResponse> {
  const boundary = '----ProofigSubmitBoundary' + Math.random().toString(36).slice(2);
  const crlf = '\r\n';

  const jsonPart = JSON.stringify(params);

  const jsonHeader = Buffer.from(
    `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="application/json"${crlf}` +
      `Content-Type: application/json${crlf}${crlf}`,
    'utf8',
  );

  const jsonFooter = Buffer.from(crlf, 'utf8');

  const fileHeader = Buffer.from(
    `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="PDF"; filename="${pdfFilename}"${crlf}` +
      `Content-Type: application/pdf${crlf}${crlf}`,
    'utf8',
  );

  const fileFooter = Buffer.from(crlf + `--${boundary}--${crlf}`, 'utf8');

  if (!pdfResponse.body) {
    throw new Error('PDF download response has no body to stream');
  }

  const pdfReadable = Readable.fromWeb(
    pdfResponse.body as unknown as NodeReadableStream<Uint8Array>,
  );

  const bodyStream = Readable.from(
    (async function* () {
      yield jsonHeader;
      yield Buffer.from(jsonPart, 'utf8');
      yield jsonFooter;

      yield fileHeader;
      for await (const chunk of pdfReadable) {
        yield chunk as Buffer;
      }
      yield fileFooter;
    })(),
  );

  const base = baseUrl.replace(/\/$/, '');
  const url = `${base}/api/submit`;

  // duplex: 'half' is required by Node/undici for streaming request bodies. It is correctly typed in
  // undici-types (and thus in @types/node when Node wins), but our tsconfig loads vite + vitest
  // types, so global RequestInit can be the DOM one (no duplex). We widen so this file type-checks.
  const headers: Record<string, string> = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    Authorization: `Bearer ${accessToken}`,
    // No Content-Length: rely on chunked transfer encoding
  };
  const init: RequestInit & { duplex?: 'half' } = {
    method: 'POST',
    headers,
    duplex: 'half',
    body: bodyStream as unknown as BodyInit,
  };
  const response = await fetch(url, init);

  const text = await response.text();
  let json: ProofigSubmitResponse;
  try {
    json = text ? (JSON.parse(text) as ProofigSubmitResponse) : {};
  } catch {
    throw new Error(
      `Proofig API returned non-JSON ${url} - (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  if (!response.ok) {
    const msg = json.error_message ?? text ?? response.statusText;
    throw new Error(`Proofig API error ${url} - ${response.status} ${response.statusText}: ${msg}`);
  }

  return json;
}

/** Detects errors thrown by `postToProofigStream` for a given HTTP status (e.g. 401 retry). */
export function proofigSubmitErrorHasStatus(err: unknown, status: number): boolean {
  return err instanceof Error && err.message.includes(` - ${status} `);
}
