// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Context } from '@curvenote/scms-core';

const { getTextIntegrityConfigWithOverrides } = vi.hoisted(() => ({
  getTextIntegrityConfigWithOverrides: vi.fn(),
}));

vi.mock('./config.server.js', () => ({
  getTextIntegrityConfigWithOverrides,
}));

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({})),
}));

const { readManifestLogo, resolveTextIntegrityDesignManifest, resolveTextIntegrityUploadLogoUrl } =
  await import('./manifest.server.js');

function makeCtx(relayBaseUrl?: string): Context {
  return {
    $config: {
      app: {
        checks: relayBaseUrl ? { relayBaseUrl } : {},
        extensions: { 'checks-text-integrity': {} },
      },
    },
  } as Context;
}

describe('readManifestLogo', () => {
  it('returns trimmed logo when present', () => {
    expect(readManifestLogo({ logo: ' https://cdn/logo.svg ' })).toBe('https://cdn/logo.svg');
  });

  it('returns undefined for empty or missing logo', () => {
    expect(readManifestLogo({ logo: '  ' })).toBeUndefined();
    expect(readManifestLogo({ title: 'iThenticate' })).toBeUndefined();
    expect(readManifestLogo(null)).toBeUndefined();
  });
});

describe('resolveTextIntegrityUploadLogoUrl', () => {
  beforeEach(() => {
    getTextIntegrityConfigWithOverrides.mockReset();
  });

  it('returns logo when manifest is partial (other fields missing)', async () => {
    getTextIntegrityConfigWithOverrides.mockResolvedValue({
      manifest: { logo: 'https://cdn.example/logo.svg' },
    });

    await expect(resolveTextIntegrityUploadLogoUrl(makeCtx())).resolves.toBe(
      'https://cdn.example/logo.svg',
    );
  });

  it('does not apply relay fallback on upload route', async () => {
    getTextIntegrityConfigWithOverrides.mockResolvedValue({ manifest: {} });

    await expect(
      resolveTextIntegrityUploadLogoUrl(makeCtx('https://relay.example')),
    ).resolves.toBeUndefined();
  });
});

describe('resolveTextIntegrityDesignManifest', () => {
  beforeEach(() => {
    getTextIntegrityConfigWithOverrides.mockReset();
  });

  it('fills defaults when manifest only has logo', async () => {
    getTextIntegrityConfigWithOverrides.mockResolvedValue({
      manifest: { logo: 'https://cdn.example/logo.svg' },
    });

    await expect(resolveTextIntegrityDesignManifest(makeCtx())).resolves.toEqual({
      name: 'ithenticate',
      title: 'iThenticate',
      logo: 'https://cdn.example/logo.svg',
      version: '1.0.0',
    });
  });

  it('uses relay fallback logo when manifest has no logo', async () => {
    getTextIntegrityConfigWithOverrides.mockResolvedValue({ manifest: { title: 'TI' } });

    await expect(
      resolveTextIntegrityDesignManifest(makeCtx('https://relay.example/')),
    ).resolves.toMatchObject({
      logo: 'https://relay.example/api/assets/ithenticate/logo.svg',
    });
  });

  it('returns logo when manifest fails strict snapshot validation', async () => {
    getTextIntegrityConfigWithOverrides.mockResolvedValue({
      manifest: { logo: 'https://cdn.example/logo.svg', name: 123, version: null },
    });

    await expect(resolveTextIntegrityDesignManifest(makeCtx())).resolves.toMatchObject({
      logo: 'https://cdn.example/logo.svg',
    });
  });
});
