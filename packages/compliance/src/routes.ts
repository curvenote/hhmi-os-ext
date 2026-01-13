import type { RouteRegistration } from '@curvenote/scms-core';
import { resolveRoutePath } from '@curvenote/scms-server';
import { route } from '@react-router/dev/routes';
import type { RouteConfig } from '@react-router/dev/routes';

const routes = [
  route('compliance', resolveRoutePath(import.meta.url, 'routes/compliance.tsx'), [
    // User routes
    route('reports/me', resolveRoutePath(import.meta.url, 'routes/compliance.reports.me.tsx')),
    route(
      'reports/me/link',
      resolveRoutePath(import.meta.url, 'routes/compliance.reports.link.tsx'),
    ),
    route('qualify', resolveRoutePath(import.meta.url, 'routes/compliance.qualify/route.tsx')),
    route('share', resolveRoutePath(import.meta.url, 'routes/compliance.share/route.tsx')),
    route('shared', resolveRoutePath(import.meta.url, 'routes/compliance.shared.tsx')),
    route(
      'shared/reports/:orcid',
      resolveRoutePath(import.meta.url, 'routes/compliance.shared.reports.$orcid.tsx'),
    ),
    // Admin routes
    route(
      'scientists',
      resolveRoutePath(import.meta.url, 'routes/compliance.scientists/route.tsx'),
    ),
    route(
      'scientists/:orcid',
      resolveRoutePath(import.meta.url, 'routes/compliance.scientists.$orcid.tsx'),
    ),

    // Action routes
    route('help-request', resolveRoutePath(import.meta.url, 'routes/compliance.help-request.tsx')),

    // Compliance Wizard
  ]),
  route(
    'task/compliance-wizard',
    resolveRoutePath(import.meta.url, 'routes/task.compliance.wizard.tsx'),
  ),
];

/**
 * Registers routes for the compliance extension.
 * @param appConfig - Application configuration
 * @returns Array of route registrations
 */
export async function registerRoutes(appConfig: AppConfig): Promise<RouteRegistration[]> {
  return [
    {
      attachTo: 'app',
      register: () => routes,
    },
  ];
}

export default routes satisfies RouteConfig;
