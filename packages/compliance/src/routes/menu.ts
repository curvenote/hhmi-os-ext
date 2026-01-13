import type { ServerSideMenuContents } from '@curvenote/scms-core';
import type { ComplianceReportSharedWith } from '../backend/access.server.js';

export type ComplianceReportSharedWithScientistName = ComplianceReportSharedWith & {
  scientistName?: string;
};

export function buildComplianceMenu(
  baseUrl: string,
  isComplianceAdmin: boolean,
  hasOrcid: boolean,
  currentUserExistsInAirtable: boolean,
  role: 'scientist' | 'lab-manager' | undefined,
  sharedReports: ComplianceReportSharedWithScientistName[] = [],
): ServerSideMenuContents {
  const userMenus: ServerSideMenuContents[0]['menus'] = [];

  if (role === 'scientist') {
    userMenus.push({
      name: 'compliance.report',
      label: 'My Dashboard',
      icon: 'layout-dashboard',
      url: `${baseUrl}/reports/me`,
    });

    if (hasOrcid && currentUserExistsInAirtable) {
      userMenus.push({
        name: 'compliance.share',
        label: 'Delegate Access',
        icon: 'user-plus',
        url: `${baseUrl}/share`,
      });
    }
  }

  // Always show "Shared Dashboards" if there are any
  if (role === 'lab-manager' || sharedReports.length > 0) {
    userMenus.push({
      name: 'compliance.shared',
      label: 'Dashboards',
      icon: 'users',
      url: `${baseUrl}/shared`,
      end: true,
    });
    if (sharedReports.length > 0) {
      sharedReports.forEach((sharedReport: ComplianceReportSharedWithScientistName) => {
        userMenus.push({
          name: 'compliance.shared',
          label: sharedReport.scientistName ?? sharedReport.user.display_name ?? sharedReport.orcid ?? 'Unknown',
          icon: 'layout-dashboard',
          url: `${baseUrl}/shared/reports/${sharedReport.orcid}`,
        });
      });
    }
  }

  const adminMenus: ServerSideMenuContents[0]['menus'] = [];
  // Admin section - only for compliance officers
  if (isComplianceAdmin) {
    // Add admin section
    adminMenus.push({
      name: 'compliance.dashboard',
      label: 'Compliance Management',
      icon: 'search',
      url: `${baseUrl}/scientists`,
    });
  }

  return [
    { sectionName: 'Compliance Administration', menus: adminMenus },
    { sectionName: 'Compliance Tools', menus: userMenus },
  ];
}
