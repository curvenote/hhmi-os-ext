import type { RouteConfigEntry } from '@react-router/dev/routes';
import type { RouteRegistration } from '@curvenote/scms-core';
import type { Config } from '@/types/app-config.js';
import { route } from '@react-router/dev/routes';
import { resolveRoutePath } from '@curvenote/scms-server';

/**
 * Registers routes for the Text Integrity checks extension.
 * Webhook route is mounted under `/v1/hooks/*` via `attachTo: 'v1/hooks'`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function registerRoutes(_appConfig: Config): Promise<RouteRegistration[]> {
  return [
    {
      attachTo: 'v1/hooks',
      register: () =>
        [
          route(
            'text-integrity/notify/:id',
            resolveRoutePath(
              import.meta.url,
              'routes/v1.hooks.text-integrity.notify.$id/route.tsx',
            ),
          ),
          route(
            'text-integrity/retry-sweep',
            resolveRoutePath(
              import.meta.url,
              'routes/v1.hooks.text-integrity.retry-sweep/route.tsx',
            ),
          ),
          route(
            'text-integrity/eula-cache/refresh',
            resolveRoutePath(
              import.meta.url,
              'routes/v1.hooks.text-integrity.eula-cache.refresh/route.tsx',
            ),
          ),
        ] satisfies RouteConfigEntry[],
    },
    {
      attachTo: 'app',
      register: () =>
        [
          route(
            'checks-text-integrity/download-pdf/:id',
            resolveRoutePath(
              import.meta.url,
              'routes/app.checks-text-integrity.download-pdf.$id/route.tsx',
            ),
          ),
        ] satisfies RouteConfigEntry[],
    },
    {
      attachTo: 'app/extensions',
      register: () =>
        [
          route(
            'checks-text-integrity/actions',
            resolveRoutePath(
              import.meta.url,
              'routes/app.extensions.checks-text-integrity.actions/route.tsx',
            ),
          ),
        ] satisfies RouteConfigEntry[],
    },
  ];
}
