import type { MenuContents, NavigationRegistration } from '@curvenote/scms-core';

/**
 * Registers navigation menu items for the PMC extension.
 * @returns Array of navigation registrations
 */
export function registerNavigation() {
  return [
    {
      attachTo: 'app/sites/pmc',
      replace: true,
      register: (baseUrl: string) =>
        [
          {
            sectionName: 'PMC Admin',
            menus: [
              {
                name: 'inbox',
                label: 'Admin Inbox',
                url: `${baseUrl}/inbox`,
              },
              {
                name: 'admin.users',
                label: 'Who can access this?',
                url: `${baseUrl}/users`,
              },
              {
                name: 'workflow-sync',
                label: 'Workflow Sync',
                url: `${baseUrl}/workflow-sync`,
              },
              {
                name: 'grants-sync',
                label: 'Grants Sync',
                url: `${baseUrl}/grants`,
              },
            ],
          },
        ] satisfies MenuContents,
    },
  ] satisfies NavigationRegistration[];
}
