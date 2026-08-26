import { describe, expect, it } from 'vitest';
import {
  PROOFIG_TOKEN_CACHE_LIFETIME_FRACTION,
  computeCacheExpiresAtIso,
  jwtClaimToUnixMs,
  jwtExpToUnixMs,
  parseJwtExp,
  parseJwtIat,
  proofigTokenObjectId,
} from './proofigAuth.server.js';

function jwtWithClaims(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${body}.signature-not-verified`;
}

describe('parseJwtExp', () => {
  it('reads exp from JWT-shaped access_token (middle segment)', () => {
    const exp = 2_000_000_000;
    expect(
      parseJwtExp(
        jwtWithClaims({
          exp,
          iat: exp - 120,
          customer_id: 32,
          user_id: 75,
          user_role: 'EJPress',
        }),
      ),
    ).toBe(exp);
  });
});

describe('parseJwtIat', () => {
  it('reads iat from JWT-shaped access_token', () => {
    const iat = 1_783_424_653;
    expect(
      parseJwtIat(
        jwtWithClaims({
          iat,
          exp: iat + 86_400,
          customer_id: 4493,
        }),
      ),
    ).toBe(iat);
  });
});

describe('proofigTokenObjectId', () => {
  it('prefixes type and uses 32-char hex (SHA-256 truncated) so the row id is human-scannable', () => {
    expect(proofigTokenObjectId('https://proofig.example.com/ej/', 'client-alpha')).toBe(
      'extension:proofig:token:bf287dfcc03b319508757097da444e9a',
    );
  });

  it('normalizes trailing slash on base URL so the same endpoint string hashes the same', () => {
    expect(proofigTokenObjectId('https://proofig.example.com/ej', 'client-alpha')).toBe(
      'extension:proofig:token:bf287dfcc03b319508757097da444e9a',
    );
  });

  it('changes hash when clientId changes (independent cache per credential identity)', () => {
    expect(proofigTokenObjectId('https://proofig.example.com/ej', 'client-beta')).toBe(
      'extension:proofig:token:8f25f0b5832942acc12a14decb713b95',
    );
  });
});

describe('jwtClaimToUnixMs', () => {
  it('treats typical JWT claims as seconds', () => {
    expect(jwtClaimToUnixMs(1_000_000_000)).toBe(1_000_000_000_000);
  });

  it('treats very large values as milliseconds', () => {
    expect(jwtClaimToUnixMs(1_000_000_000_000)).toBe(1_000_000_000_000);
  });

  it('jwtExpToUnixMs delegates to jwtClaimToUnixMs', () => {
    expect(jwtExpToUnixMs(1_000_000_000)).toBe(jwtClaimToUnixMs(1_000_000_000));
  });
});

describe('computeCacheExpiresAtIso', () => {
  it('expires at 50% of observed Proofig token lifetime (24h → 12h cache)', () => {
    const iatSec = 1_783_424_653;
    const expSec = 1_783_511_053;
    const iatMs = jwtClaimToUnixMs(iatSec);
    const lifetimeMs = jwtClaimToUnixMs(expSec) - iatMs;
    const expectedMs = iatMs + PROOFIG_TOKEN_CACHE_LIFETIME_FRACTION * lifetimeMs;
    expect(computeCacheExpiresAtIso(iatSec, expSec, iatMs)).toBe(
      new Date(expectedMs).toISOString(),
    );
  });

  it('returns now when cache midpoint is already past', () => {
    const iatSec = 1_000_000_000;
    const expSec = iatSec + 3_600;
    const nowMs = jwtClaimToUnixMs(iatSec) + 2_000 * 1000; // past 50% mark
    expect(computeCacheExpiresAtIso(iatSec, expSec, nowMs)).toBe(new Date(nowMs).toISOString());
  });

  it('returns now when exp is not after iat', () => {
    const nowMs = 1_000_000_000_000;
    expect(computeCacheExpiresAtIso(1_000_000_000, 1_000_000_000, nowMs)).toBe(
      new Date(nowMs).toISOString(),
    );
  });
});
