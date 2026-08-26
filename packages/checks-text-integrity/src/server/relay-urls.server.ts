/**
 * checks-relay HTTP paths (instance-based client API).
 * @see checks-relay apps/relay/docs/api-reference.md
 */

export type AppChecksRelayConfig = {
  relayBaseUrl?: string;
  relayApiKey?: string;
};

/**
 * Relay instance segment in `/instances/{id}/` paths.
 * From merged extension config (YAML + Object overlay) only; default `default`.
 */
export function resolveRelayInstanceId(merged: Record<string, unknown> | undefined): string {
  const fromMerged = merged?.relayInstanceId;
  if (typeof fromMerged === 'string' && fromMerged.trim() !== '') {
    return fromMerged.trim();
  }
  return 'default';
}

function baseServicesPath(relayBaseUrl: string, serviceName: string, instanceId: string): string {
  const b = relayBaseUrl.replace(/\/$/, '');
  return `${b}/api/v1/services/${encodeURIComponent(serviceName)}/instances/${encodeURIComponent(instanceId)}`;
}

export function checksRelayUploadUrl(
  relayBaseUrl: string,
  serviceName: string,
  instanceId: string,
): string {
  return `${baseServicesPath(relayBaseUrl, serviceName, instanceId)}/upload`;
}

export function checksRelayConfigureUrl(
  relayBaseUrl: string,
  serviceName: string,
  instanceId: string,
): string {
  return `${baseServicesPath(relayBaseUrl, serviceName, instanceId)}/configure`;
}

export function checksRelayStatusUrl(
  relayBaseUrl: string,
  serviceName: string,
  instanceId: string,
): string {
  return `${baseServicesPath(relayBaseUrl, serviceName, instanceId)}/status`;
}

export function checksRelayTermsUrl(
  relayBaseUrl: string,
  serviceName: string,
  instanceId: string,
): string {
  return `${baseServicesPath(relayBaseUrl, serviceName, instanceId)}/terms`;
}

export function checksRelayTermsAcceptUrl(
  relayBaseUrl: string,
  serviceName: string,
  instanceId: string,
): string {
  return `${baseServicesPath(relayBaseUrl, serviceName, instanceId)}/terms/accept`;
}

export function checksRelayReportViewerUrl(
  relayBaseUrl: string,
  serviceName: string,
  instanceId: string,
  externalId: string,
): string {
  return `${baseServicesPath(relayBaseUrl, serviceName, instanceId)}/check/${encodeURIComponent(externalId)}/report/viewer-url`;
}

export function checksRelayReportStartGenerationUrl(
  relayBaseUrl: string,
  serviceName: string,
  instanceId: string,
  externalId: string,
): string {
  return `${baseServicesPath(relayBaseUrl, serviceName, instanceId)}/check/${encodeURIComponent(externalId)}/report/start-generation`;
}

export function checksRelayReportPdfStartUrl(
  relayBaseUrl: string,
  serviceName: string,
  instanceId: string,
  externalId: string,
): string {
  return `${baseServicesPath(relayBaseUrl, serviceName, instanceId)}/check/${encodeURIComponent(externalId)}/report/pdf/start`;
}

/** POST — returns {@link import('@curvenote/check-relay-types').RelayCheckStatusResponse} */
export function checksRelayCheckStatusUrl(
  relayBaseUrl: string,
  serviceName: string,
  instanceId: string,
  externalId: string,
): string {
  return `${baseServicesPath(relayBaseUrl, serviceName, instanceId)}/check/${encodeURIComponent(externalId)}/status`;
}

export function checksRelayReportFetchUrl(
  relayBaseUrl: string,
  serviceName: string,
  instanceId: string,
  externalId: string,
): string {
  return `${baseServicesPath(relayBaseUrl, serviceName, instanceId)}/check/${encodeURIComponent(externalId)}/report/fetch`;
}

/** Provider id for relay check-scoped paths (newest first). */
export function resolveRelayExternalCheckId(
  serviceData:
    | {
        externalId?: string;
        externalRef?: string;
        submissionId?: string;
      }
    | undefined,
): string | undefined {
  const a = serviceData?.externalId?.trim();
  if (a) return a;
  const b = serviceData?.externalRef?.trim();
  if (b) return b;
  const c = serviceData?.submissionId?.trim();
  return c || undefined;
}
