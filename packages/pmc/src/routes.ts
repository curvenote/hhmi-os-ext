import type { RouteConfigEntry } from '@react-router/dev/routes';
import type { RouteRegistration } from '@curvenote/scms-core';
import type { Config } from '@/types/app-config.js';
import { route, index } from '@react-router/dev/routes';
import { resolveRoutePath } from '@curvenote/scms-server';

/**
 * Registers routes for the PMC extension.
 * @param appConfig - Application configuration
 * @returns Array of route registrations
 */
export async function registerRoutes(appConfig: Config): Promise<RouteRegistration[]> {
  return [
    {
      attachTo: 'app/works',
      register: () =>
        [
          route('pmc', resolveRoutePath(import.meta.url, 'routes/pmc.ts')),
        ] satisfies RouteConfigEntry[],
    },

    {
      attachTo: 'app/works/:workId',
      register: () =>
        [
          route('site/pmc', resolveRoutePath(import.meta.url, 'routes/$workId.pmc.tsx'), [
            index(resolveRoutePath(import.meta.url, 'routes/$workId.pmc._index.tsx')),
            route(
              'deposit/:submissionVersionId',
              resolveRoutePath(
                import.meta.url,
                'routes/$workId.pmc.deposit.$submissionVersionId.tsx',
              ),
            ),
            route(
              'confirm/:submissionVersionId',
              resolveRoutePath(
                import.meta.url,
                'routes/$workId.pmc.confirm.$submissionVersionId.tsx',
              ),
            ),
            route(
              'journal-search',
              resolveRoutePath(import.meta.url, 'routes/$workId.pmc.journal-search.tsx'),
            ),
            route(
              'submission/:submissionVersionId',
              resolveRoutePath(
                import.meta.url,
                'routes/$workId.pmc.submission.$submissionVersionId.tsx',
              ),
            ),
          ]),
        ] satisfies RouteConfigEntry[],
    },
    {
      attachTo: 'app',
      register: () =>
        [
          route('sites/pmc', resolveRoutePath(import.meta.url, 'routes/$siteName.tsx'), [
            route('inbox', resolveRoutePath(import.meta.url, 'routes/$siteName.inbox/route.tsx')),
            route(
              'deposits/:submissionId/v/:submissionVersionId',
              resolveRoutePath(
                import.meta.url,
                'routes/$siteName.deposits.$submissionId.v.$submissionVersionId.tsx',
              ),
            ),
            route(
              'submissions',
              resolveRoutePath(import.meta.url, 'routes/$siteName.redirect-inbox.tsx'),
            ),
            route(
              'workflow-sync',
              resolveRoutePath(import.meta.url, 'routes/$siteName.workflow-sync.tsx'),
            ),
            route('grants', resolveRoutePath(import.meta.url, 'routes/$siteName.grants.tsx')),
          ]),
        ] satisfies RouteConfigEntry[],
    },
    {
      attachTo: 'v1/hooks',
      register: () =>
        [
          route('pmc-email', resolveRoutePath(import.meta.url, 'routes/v1.hooks.pmc-email.ts')),
          route(
            'pmc-workflow-sync',
            resolveRoutePath(import.meta.url, 'routes/v1.hooks.pmc-workflow-sync.ts'),
          ),
        ] satisfies RouteConfigEntry[],
    },
  ];
}
