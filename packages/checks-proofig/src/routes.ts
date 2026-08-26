import type { RouteConfigEntry } from '@react-router/dev/routes';
import type { RouteRegistration } from '@curvenote/scms-core';
import type { Config } from '@/types/app-config.js';
import { route } from '@react-router/dev/routes';
import { resolveRoutePath } from '@curvenote/scms-server';

/**
 * Registers routes for the Proofig checks extension.
 *
 * Webhook routes are mounted under `/v1/hooks/*` via `attachTo: 'v1/hooks'`.
 * App route for manuscript checks is mounted at `/app/manuscript-checks` via `attachTo: 'app'`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function registerRoutes(_appConfig: Config): Promise<RouteRegistration[]> {
  return [
    {
      attachTo: 'v1/hooks',
      register: () =>
        [
          route(
            'proofig/notify/:id',
            resolveRoutePath(import.meta.url, 'routes/v1.hooks.proofig.notify.$id/route.tsx'),
          ),
          route(
            'proofig/pdf-stored/:id',
            resolveRoutePath(import.meta.url, 'routes/v1.hooks.proofig.pdf-stored.$id/route.tsx'),
          ),
        ] satisfies RouteConfigEntry[],
    },
    {
      attachTo: 'app',
      register: () =>
        [
          route('integrity', resolveRoutePath(import.meta.url, 'routes/integrity/route.tsx')),
          route(
            'checks-proofig/download-pdf/:id',
            resolveRoutePath(
              import.meta.url,
              'routes/app.checks-proofig.download-pdf.$id/route.tsx',
            ),
          ),
        ] satisfies RouteConfigEntry[],
    },
    {
      attachTo: 'app/extensions',
      register: () =>
        [
          route(
            'proofig/actions',
            resolveRoutePath(import.meta.url, 'routes/app.extensions.proofig.actions/route.tsx'),
          ),
        ] satisfies RouteConfigEntry[],
    },
  ];
}
