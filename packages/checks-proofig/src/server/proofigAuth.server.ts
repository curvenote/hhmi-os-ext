import { createHash } from 'node:crypto';
import type { Prisma } from '@curvenote/scms-db';
import { getPrismaClient } from '@curvenote/scms-server';

/** Object.type for cached Proofig access token rows. */
export const PROOFIG_TOKEN_OBJECT_TYPE = 'extension:proofig:token';

/** Response from POST <BaseURL>/auth/authenticate. */
export interface ProofigAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Stored token record in Object.data (JWT-derived expiry, not expires_in from the body). */
export interface ProofigTokenCacheData {
  access_token: string;
  token_type: string;
  /** ISO-8601; cache is valid until this instant (already shortened vs JWT exp). */
  expiresAt: string;
  /** Normalized Proofig API base (no trailing slash); mirrors the id hash input. */
  apiBaseUrl: string;
  clientId: string;
}

const AUTH_PATH = '/auth/authenticate';

function normalizeApiBase(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/$/, '');
}

/** Stable `Object.id` for the Proofig token cache: `extension:proofig:token:` + first 32 hex chars of SHA-256(normalized base + NUL + clientId). */
export function proofigTokenObjectId(apiBaseUrl: string, clientId: string): string {
  const base = normalizeApiBase(apiBaseUrl);
  const hash = createHash('sha256').update(`${base}\0${clientId}`).digest('hex').slice(0, 32);
  return `${PROOFIG_TOKEN_OBJECT_TYPE}:${hash}`;
}

/**
 * JWT epoch claims (`iat`, `exp`) are normally seconds since epoch. Values large enough to be ms are treated as ms.
 */
export function jwtClaimToUnixMs(claim: number): number {
  if (claim > 10_000_000_000) return claim;
  return claim * 1000;
}

/** @deprecated Use {@link jwtClaimToUnixMs}. */
export function jwtExpToUnixMs(exp: number): number {
  return jwtClaimToUnixMs(exp);
}

/** Fraction of JWT lifetime (`exp` − `iat`) after which the cached token is discarded. */
export const PROOFIG_TOKEN_CACHE_LIFETIME_FRACTION = 0.5;

/**
 * Cache expiry at `iat` + 50% of token lifetime (`exp` − `iat`). If that instant is already past, returns `now`.
 */
export function computeCacheExpiresAtIso(
  iatClaim: number,
  expClaim: number,
  nowMs: number = Date.now(),
): string {
  const iatMs = jwtClaimToUnixMs(iatClaim);
  const expMs = jwtClaimToUnixMs(expClaim);
  const lifetimeMs = expMs - iatMs;
  if (lifetimeMs <= 0) {
    return new Date(nowMs).toISOString();
  }
  const cacheUntilMs = iatMs + PROOFIG_TOKEN_CACHE_LIFETIME_FRACTION * lifetimeMs;
  if (cacheUntilMs <= nowMs) {
    return new Date(nowMs).toISOString();
  }
  return new Date(cacheUntilMs).toISOString();
}

function parseJwtPayload(accessToken: string): Record<string, unknown> {
  const parts = accessToken.split('.');
  if (parts.length < 2) {
    throw new Error('Proofig access_token is not a JWT (cannot read claims)');
  }
  let json: unknown;
  try {
    const payload = parts[1];
    json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Proofig access_token JWT payload is not valid JSON');
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Proofig access_token JWT payload is not an object');
  }
  return json as Record<string, unknown>;
}

function parseJwtNumericClaim(accessToken: string, claim: 'exp' | 'iat', label: string): number {
  const payload = parseJwtPayload(accessToken);
  if (!(claim in payload)) {
    throw new Error(`Proofig access_token JWT missing ${claim} claim`);
  }
  const value = payload[claim];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Proofig access_token JWT ${label} claim is not a finite number`);
  }
  return value;
}

export function parseJwtExp(accessToken: string): number {
  return parseJwtNumericClaim(accessToken, 'exp', 'exp');
}

export function parseJwtIat(accessToken: string): number {
  return parseJwtNumericClaim(accessToken, 'iat', 'iat');
}

function readCachedToken(
  data: unknown,
  expectedBase: string,
  expectedClientId: string,
): { token: string } | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const storedBase = d.apiBaseUrl;
  const storedClientId = d.clientId;
  if (typeof storedBase === 'string' && typeof storedClientId === 'string') {
    if (normalizeApiBase(storedBase) !== expectedBase || storedClientId !== expectedClientId) {
      return null;
    }
  }
  const token = d.access_token;
  const expiresAt = d.expiresAt;
  if (typeof token !== 'string' || !token.trim()) return null;
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) return null;
  const until = Date.parse(expiresAt);
  if (Number.isNaN(until) || until <= Date.now()) return null;
  return { token };
}

async function authenticateAndCache(
  normalizedApiBase: string,
  clientId: string,
  clientSecret: string,
  objectId: string,
): Promise<string> {
  const prisma = await getPrismaClient();
  const authUrl = `${normalizedApiBase}${AUTH_PATH}`;
  const body = JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
  const text = await response.text();
  let json: ProofigAuthResponse;
  try {
    json = text ? (JSON.parse(text) as ProofigAuthResponse) : ({} as ProofigAuthResponse);
  } catch {
    throw new Error(
      `Proofig API returned non-JSON ${authUrl} - (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  if (!response.ok) {
    const msg = (json as { error_message?: string }).error_message ?? text ?? response.statusText;
    throw new Error(
      `Proofig API error ${authUrl} - ${response.status} ${response.statusText}: ${msg}`,
    );
  }
  if (!json.access_token) {
    throw new Error(`Proofig API error ${authUrl} - Proofig auth response missing access_token`);
  }

  const nowMs = Date.now();
  const iatClaim = parseJwtIat(json.access_token);
  const expClaim = parseJwtExp(json.access_token);
  const expiresAt = computeCacheExpiresAtIso(iatClaim, expClaim, nowMs);

  const cacheData: ProofigTokenCacheData = {
    access_token: json.access_token,
    token_type: json.token_type,
    expiresAt,
    apiBaseUrl: normalizedApiBase,
    clientId,
  };
  const nowIso = new Date(nowMs).toISOString();
  const dataJson = cacheData as unknown as Prisma.InputJsonValue;

  await prisma.object.upsert({
    where: { id: objectId },
    create: {
      id: objectId,
      type: PROOFIG_TOKEN_OBJECT_TYPE,
      date_created: nowIso,
      date_modified: nowIso,
      data: dataJson,
    },
    update: {
      data: dataJson,
      date_modified: nowIso,
    },
    select: { id: true },
  });

  return json.access_token;
}

/**
 * Returns a Proofig Bearer token, using a row in `Object` when still valid.
 * On miss or expiry, calls `POST …/auth/authenticate`, caches `access_token` until
 * {@link PROOFIG_TOKEN_CACHE_LIFETIME_FRACTION} of the JWT lifetime (`exp` − `iat`) has elapsed.
 */
export async function getProofingToken(
  apiBaseUrl: string,
  mergedConfig: Record<string, unknown>,
): Promise<string> {
  const clientId = mergedConfig.clientId as string | undefined;
  const clientSecret = mergedConfig.clientSecret as string | undefined;
  if (!clientId?.trim() || !clientSecret?.trim()) {
    throw new Error(
      'checks-proofig extension config missing clientId or clientSecret; cannot authenticate with Proofig',
    );
  }

  const base = normalizeApiBase(apiBaseUrl);
  const objectId = proofigTokenObjectId(apiBaseUrl, clientId.trim());
  const trimmedClientId = clientId.trim();

  const prisma = await getPrismaClient();
  const row = await prisma.object.findUnique({ where: { id: objectId } });
  const cached = row?.data ? readCachedToken(row.data, base, trimmedClientId) : null;
  if (cached) return cached.token;

  return authenticateAndCache(base, trimmedClientId, clientSecret.trim(), objectId);
}

/**
 * Forces the next `getProofingToken` to re-authenticate by setting cached `expiresAt` to the past.
 * Used when Proofig returns 401 while the cache still considers the token valid.
 */
export async function invalidateProofingTokenCache(
  apiBaseUrl: string,
  mergedConfig: Record<string, unknown>,
): Promise<void> {
  const clientId = mergedConfig.clientId as string | undefined;
  if (!clientId?.trim()) return;

  const objectId = proofigTokenObjectId(apiBaseUrl, clientId.trim());
  const prisma = await getPrismaClient();
  const row = await prisma.object.findUnique({ where: { id: objectId } });
  if (!row?.data || typeof row.data !== 'object' || Array.isArray(row.data)) return;

  const pastIso = new Date(Date.now() - 1000).toISOString();
  const nextData = { ...(row.data as Record<string, unknown>), expiresAt: pastIso };
  const nowIso = new Date().toISOString();

  await prisma.object.update({
    where: { id: objectId },
    data: {
      data: nextData as unknown as Prisma.InputJsonValue,
      date_modified: nowIso,
    },
    select: { id: true },
  });
}
