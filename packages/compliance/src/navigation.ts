import type { MenuContents, NavigationRegistration } from '@curvenote/scms-core';

/**
 * Registers navigation menu items for the compliance extension.
 * @returns Array of navigation registrations
 */
export function registerNavigation(): NavigationRegistration[] {
  return [
    {
      attachTo: 'app',
      replace: false,
      register: (baseUrl: string) =>
        [
          {
            sectionName: 'Compliance Dashboard',
            menus: [
              {
                name: 'hhmi-compliance',
                label: 'Compliance Dashboard',
                url: `${baseUrl}/compliance`,
              },
            ],
          },
        ] satisfies MenuContents,
    },
  ];
}
