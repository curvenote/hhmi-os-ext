import type { Context } from '@curvenote/scms-core';
import { getPrismaClient } from '@curvenote/scms-server';
import { getTextIntegrityConfigWithOverrides } from './config.server.js';
import type { ServiceManifestSnapshot } from '../serviceDataSchemas.js';

const DEFAULT_DESIGN_MANIFEST: ServiceManifestSnapshot = {
  name: 'ithenticate',
  title: 'iThenticate',
  logo: '',
  version: '1.0.0',
};

function relayLogoFallback(ctx: Context): string | undefined {
  const checks = ctx.$config.app?.checks as Record<string, unknown> | undefined;
  const relayBaseUrl =
    typeof checks?.relayBaseUrl === 'string' ? checks.relayBaseUrl.trim().replace(/\/$/, '') : '';
  return relayBaseUrl ? `${relayBaseUrl}/api/assets/ithenticate/logo.svg` : undefined;
}

/** Logo URL from merged extension config manifest (object-store overlay included). */
export function readManifestLogo(manifest: unknown): string | undefined {
  if (manifest == null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return undefined;
  }
  const logo = (manifest as Record<string, unknown>).logo;
  return typeof logo === 'string' && logo.trim() !== '' ? logo.trim() : undefined;
}

async function loadMergedExtensionConfig(ctx: Context): Promise<Record<string, unknown>> {
  const base = ctx.$config?.app?.extensions?.['checks-text-integrity'] as
    | Record<string, unknown>
    | undefined;
  const prisma = await getPrismaClient();
  return getTextIntegrityConfigWithOverrides(base ?? {}, prisma);
}

function resolveDesignManifest(partial?: ServiceManifestSnapshot): ServiceManifestSnapshot {
  if (!partial) return { ...DEFAULT_DESIGN_MANIFEST };
  return {
    name: partial.name || DEFAULT_DESIGN_MANIFEST.name,
    title: partial.title || DEFAULT_DESIGN_MANIFEST.title,
    logo: partial.logo || DEFAULT_DESIGN_MANIFEST.logo,
    version: partial.version || DEFAULT_DESIGN_MANIFEST.version,
  };
}

function partialManifestFromUnknown(raw: unknown): ServiceManifestSnapshot | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const m = raw as Record<string, unknown>;
  return {
    name: typeof m.name === 'string' ? m.name.trim() : '',
    title: typeof m.title === 'string' ? m.title.trim() : '',
    logo: typeof m.logo === 'string' ? m.logo.trim() : '',
    version: typeof m.version === 'string' ? m.version.trim() : '',
  };
}

/** Logo URL for the upload-page check card (manifest.logo only; no relay fallback). */
export async function resolveTextIntegrityUploadLogoUrl(ctx: Context): Promise<string | undefined> {
  const config = await loadMergedExtensionConfig(ctx);
  return readManifestLogo(config.manifest);
}

/** Design-page manifest from merged config, with relay logo fallback when unset. */
export async function resolveTextIntegrityDesignManifest(
  ctx: Context,
): Promise<ServiceManifestSnapshot> {
  const config = await loadMergedExtensionConfig(ctx);
  const raw = config.manifest;
  const partial = partialManifestFromUnknown(raw);
  const logo = readManifestLogo(raw) ?? relayLogoFallback(ctx) ?? '';

  return resolveDesignManifest(
    partial ? { ...partial, logo: logo || partial.logo } : { ...DEFAULT_DESIGN_MANIFEST, logo },
  );
}
