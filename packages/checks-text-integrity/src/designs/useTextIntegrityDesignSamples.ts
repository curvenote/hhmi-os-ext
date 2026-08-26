import { useMemo } from 'react';
import { useExtensionDesignLoaderData } from '@curvenote/scms-core';
import type { ServiceManifestSnapshot } from '../serviceDataSchemas.js';
import { buildTextIntegrityDesignSampleData } from './designSampleData.js';

function readDesignManifest(
  tabLoaderData: Record<string, unknown> | undefined,
): ServiceManifestSnapshot | undefined {
  const raw = tabLoaderData?.designManifest;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return raw as ServiceManifestSnapshot;
}

export function useTextIntegrityDesignSamples() {
  const tabLoaderData = useExtensionDesignLoaderData();

  return useMemo(
    () => buildTextIntegrityDesignSampleData(readDesignManifest(tabLoaderData)),
    [tabLoaderData],
  );
}
