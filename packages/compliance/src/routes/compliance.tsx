import type { LoaderFunctionArgs } from 'react-router';
import { Outlet, redirect } from 'react-router';
import { useState, useEffect } from 'react';
import type { ServerSideMenuContents } from '@curvenote/scms-core';
import { MainWrapper, SecondaryNav } from '@curvenote/scms-core';
import { withAppContext, userHasScopes, withAppScopedContext } from '@curvenote/scms-server';
import { buildComplianceMenu } from './menu.js';
import myComplianceIcon from '../assets/my-compliance-lock.svg';
import { getComplianceReportsSharedWith } from '../backend/access.server.js';
import { checkScientistExistsByOrcid } from '../backend/airtable.scientists.server.js';
import { hhmi } from '../backend/scopes.js';
import { extension } from '../client.js';
import type { ComplianceUserMetadataSection } from '../backend/types.js';
import type { ComplianceReportSharedWith } from '../backend/access.server.js';

interface LoaderData {
  menu: ServerSideMenuContents;
  shouldShowSecondaryNav: boolean;
  currentUserExistsInAirtable: Promise<boolean>;
  orcid?: string;
  isComplianceAdmin: boolean;
  userComplianceRole?: 'scientist' | 'lab-manager';
  sharedReports: Promise<ComplianceReportSharedWith[]>;
}
  
export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
  // ✅ MINIMAL: Get context (required for user data)
  const ctx = await withAppScopedContext(args, [hhmi.compliance.feature.dashboard]);
  const pathname = new URL(args.request.url).pathname;

  // ✅ MINIMAL: Extract only what's needed for redirects
  const orcidAccount = ctx.user.linkedAccounts.find(
    (account) => account.provider === 'orcid' && !account.pending,
  );
  const userData = (ctx.user.data as ComplianceUserMetadataSection) || { compliance: {} };
  const userComplianceRole = userData.compliance?.role;
  const isComplianceAdmin = userHasScopes(ctx.user, [hhmi.compliance.admin]);

  // ✅ STEP 1: Check redirects FIRST (immediate)
  // Redirect 1: No ORCID + scientist role → redirect to link page
  if (
    (pathname.endsWith('/compliance') ||
      pathname.endsWith('/compliance/reports') ||
      pathname.endsWith('/compliance/reports/me')) &&
    !orcidAccount &&
    userComplianceRole === 'scientist' &&
    !isComplianceAdmin
  ) {
    throw redirect('/app/compliance/reports/me/link');
  }

  // Redirect 2: Known role → redirect to appropriate page
  if (
    userComplianceRole !== undefined &&
    (pathname.endsWith('/compliance') || pathname.endsWith('/compliance/reports'))
  ) {
    if (userComplianceRole === 'lab-manager') {
      if (isComplianceAdmin) {
        throw redirect('/app/compliance/scientists');
      }
      throw redirect('/app/compliance/shared');
    } else {
      throw redirect('/app/compliance/reports/me');
    }
  }

  // Redirect 3: Unknown role → redirect to qualify page
  if (userComplianceRole === undefined && !pathname.endsWith('/compliance/qualify')) {
    throw redirect('/app/compliance/qualify');
  }

  // ✅ STEP 2: Only execute if NOT redirecting (sub-routes)
  // Defer all expensive operations
  const sharedReportsPromise = getComplianceReportsSharedWith(ctx.user.id);
  
  let currentUserExistsInAirtablePromise: Promise<boolean> | null = Promise.resolve(false);
  if (orcidAccount?.idAtProvider) {
    currentUserExistsInAirtablePromise = checkScientistExistsByOrcid(orcidAccount.idAtProvider);
  }

  // Build minimal menu immediately (will be enhanced when promises resolve)
  const initialMenu = buildComplianceMenu(
    '/app/compliance',
    isComplianceAdmin,
    !!orcidAccount,
    false, // Default, will update
    userComplianceRole,
    [], // Empty initially, will update
  );

  return {
    menu: initialMenu,
    shouldShowSecondaryNav: userComplianceRole !== undefined,
    currentUserExistsInAirtable: currentUserExistsInAirtablePromise || Promise.resolve(false),
    orcid: orcidAccount?.idAtProvider ?? undefined,
    isComplianceAdmin,
    userComplianceRole,
    sharedReports: sharedReportsPromise, // Return as promise
  };
}

export default function ComplianceLayout({ loaderData }: { loaderData: LoaderData }) {
  const {
    menu: initialMenu,
    shouldShowSecondaryNav,
    currentUserExistsInAirtable,
    orcid,
    isComplianceAdmin,
    userComplianceRole,
    sharedReports,
  } = loaderData;
  
  const [menu, setMenu] = useState(initialMenu);
  const [, setIsResolvingAirtable] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const startTime = Date.now();
    
    // Resolve both promises in parallel
    Promise.all([
      currentUserExistsInAirtable,
      sharedReports,
    ])
      .then(async ([exists, reports]) => {
        // Only update state if component is still mounted and effect hasn't been cleaned up
        if (!isMounted) return;
        
        const elapsed = Date.now() - startTime;
        
        // Rebuild menu with actual values
        const updatedMenu = buildComplianceMenu(
          '/app/compliance',
          isComplianceAdmin,
          !!orcid,
          exists,
          userComplianceRole,
          reports,
        );
        
        setMenu(updatedMenu);
        setIsResolvingAirtable(false);
        
        // Log if it took a while (for debugging)
        if (elapsed > 1000) {
          console.log(`Menu data resolved in ${elapsed}ms`);
        }
      })
      .catch((error) => {
        // Only update state if component is still mounted and effect hasn't been cleaned up
        if (!isMounted) return;
        
        console.error('Failed to resolve menu data:', error);
        setIsResolvingAirtable(false);
        // Keep default menu on error
      });
    
    // Cleanup function: mark as unmounted to prevent stale state updates
    return () => {
      isMounted = false;
    };
  }, [currentUserExistsInAirtable, sharedReports, isComplianceAdmin, orcid, userComplianceRole]);

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
