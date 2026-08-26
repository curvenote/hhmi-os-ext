import type { AppChecksRelayConfig } from './relay-urls.server.js';

type AppChecksConfig = {
  relayBaseUrl?: string;
  relayApiKey?: string;
};

export function getAppChecksFromContext(ctx: {
  $config?: Record<string, unknown>;
}): AppChecksRelayConfig | undefined {
  const app = ctx.$config?.app as { checks?: AppChecksConfig } | undefined;
  return app?.checks;
}

export function getAppChecksFromAppConfig(appConfig: unknown): AppChecksRelayConfig | undefined {
  if (appConfig == null || typeof appConfig !== 'object') return undefined;
  const app = (appConfig as Record<string, unknown>).app;
  if (app == null || typeof app !== 'object') return undefined;
  const checks = (app as Record<string, unknown>).checks;
  if (checks == null || typeof checks !== 'object') return undefined;
  return checks as AppChecksRelayConfig;
}

export function resolveServiceName(merged: Record<string, unknown>): string {
  const fromExt = merged.serviceName;
  if (typeof fromExt === 'string' && fromExt.trim() !== '') return fromExt.trim();
  return 'echo';
}
