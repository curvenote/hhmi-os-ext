import type { LoaderFunctionArgs } from 'react-router';
import { Outlet, redirect } from 'react-router';
import type { ServerSideMenuContents } from '@curvenote/scms-core';
import { MainWrapper, SecondaryNav } from '@curvenote/scms-core';
import { withAppContext, userHasScopes } from '@curvenote/scms-server';
import { buildComplianceMenu } from './menu.js';
import myComplianceIcon from '../assets/my-compliance-lock.svg';
import { getComplianceReportsSharedWith } from '../backend/access.server.js';
import { checkScientistExistsByOrcid, fetchScientistByOrcid } from '../backend/airtable.scientists.server.js';
import { updateUserComplianceMetadata } from '../backend/actionHelpers.server.js';
import { HHMITrackEvent } from '../analytics/events.js';
import { hhmi } from '../backend/scopes.js';
import { extension } from '../client.js';
import type { ComplianceUserMetadataSection } from '../backend/types.js';

interface LoaderData {
  menu: ServerSideMenuContents;
  shouldShowSecondaryNav: boolean;
}

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
  const ctx = await withAppContext(args);
  const pathname = new URL(args.request.url).pathname;

  const orcidAccount = ctx.user.linkedAccounts.find(
    (account) => account.provider === 'orcid' && !account.pending,
  );

  // Check if user has opted to hide their compliance report
  const userData = (ctx.user.data as ComplianceUserMetadataSection) || { compliance: {} };

  // Lightweight check: does the user's ORCID exist in Airtable?
  let currentUserExistsInAirtable = false;
  let role = userData.compliance?.role;
  if (orcidAccount?.idAtProvider) {
    currentUserExistsInAirtable = await checkScientistExistsByOrcid(orcidAccount.idAtProvider);
    // If user exists in Airtable and role is not set, update their compliance metadata asynchronously
    if (currentUserExistsInAirtable && !role) {
      role = 'scientist';
      if (!userData.compliance?.role) {
        updateUserComplianceMetadata(ctx.user.id, { role: 'scientist' })
          .then(() => {
            // Track role qualification (auto-set)
            ctx
              .trackEvent(HHMITrackEvent.HHMI_COMPLIANCE_ROLE_QUALIFIED, {
                role: 'scientist',
                userId: ctx.user.id,
                orcid: orcidAccount.idAtProvider,
                autoSet: true,
              })
              .catch((error: unknown) => {
                console.error('Failed to track role qualification event:', error);
              });
          })
          .catch((error: unknown) => {
            console.error('Failed to update user compliance metadata:', error);
          });
      }
    }
  }

  const isComplianceAdmin = userHasScopes(ctx.user, [hhmi.compliance.admin]);

  // Scientists who have not linked their ORCID and are not a compliance admin
  // should be redirected to the link ORCID page
  if (
    (pathname.endsWith('/compliance') ||
      pathname.endsWith('/compliance/reports') ||
      pathname.endsWith('/compliance/reports/me')) &&
    !orcidAccount &&
    role === 'scientist' &&
    !isComplianceAdmin
  ) {
    throw redirect('/app/compliance/reports/me/link');
  }

  // Users where we know the role should be redirected to the appropriate page
  if (
    role !== undefined &&
    (pathname.endsWith('/compliance') || pathname.endsWith('/compliance/reports'))
  ) {
    // If user has hidden their report, redirect to shared reports instead
    if (role === 'lab-manager') {
      throw redirect('/app/compliance/shared');
    } else {
      throw redirect('/app/compliance/reports/me');
    }
  }

  // Users where we no not know the role should be redirected to the qualify page
  if (role === undefined && !pathname.endsWith('/compliance/qualify')) {
    throw redirect('/app/compliance/qualify');
  }

  // Check if any compliance dashboards are shared with this user
  const sharedReports = await getComplianceReportsSharedWith(ctx.user.id);

  // Fetch scientist data for each shared report to use their proper names
  const sharedReportsWithScientistNames = await Promise.all(
    sharedReports.map(async (report) => {
      if (report.orcid) {
        try {
          const { scientist } = await fetchScientistByOrcid(report.orcid);
          return {
            ...report,
            scientistName: scientist?.fullName,
          };
        } catch (error) {
          console.error(`Failed to fetch scientist data for ORCID ${report.orcid}:`, error);
        }
      }
      return report;
    }),
  );

  const menu = buildComplianceMenu(
    '/app/compliance',
    isComplianceAdmin,
    !!orcidAccount,
    currentUserExistsInAirtable,
    role,
    sharedReportsWithScientistNames,
  );

  const shouldShowSecondaryNav = isComplianceAdmin || role !== undefined;
  return {
    menu,
    shouldShowSecondaryNav,
  };
}

export default function ComplianceLayout({ loaderData }: { loaderData: LoaderData }) {
  const { menu, shouldShowSecondaryNav } = loaderData;

  return (
    <>
      {shouldShowSecondaryNav && (
        <SecondaryNav
          contents={menu}
          title="Compliance"
          extensions={[extension]}
          branding={{
            badge: (
              <div>
                <img src={myComplianceIcon} alt="My Compliance" className="h-10" />
              </div>
            ),
          }}
        />
      )}
      <MainWrapper hasSecondaryNav={shouldShowSecondaryNav}>
        <Outlet />
      </MainWrapper>
    </>
  );
}
