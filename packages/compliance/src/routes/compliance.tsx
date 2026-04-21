import type { LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from 'react-router';
import { Outlet, redirect, useLoaderData } from 'react-router';
import { useState, useEffect, useMemo } from 'react';
import type { ServerSideMenuContents } from '@curvenote/scms-core';
import { MainWrapper, SecondaryNav } from '@curvenote/scms-core';
import { userHasScopes, withAppScopedContext } from '@curvenote/scms-server';
import { buildComplianceMenu } from './menu.js';
import myComplianceIcon from '../assets/my-compliance-lock.svg';
import { getComplianceReportsSharedWith } from '../backend/access.server.js';
import { hhmi } from '../backend/scopes.js';
import { extension } from '../client.js';
import type { ComplianceUserMetadataSection } from '../backend/types.js';
import type { ComplianceReportSharedWith } from '../backend/access.server.js';
import { isUserComplianceManager } from '../utils/analytics.server.js';

interface LoaderData {
  menu: ServerSideMenuContents;
  shouldShowSecondaryNav: boolean;
  orcid?: string;
  isComplianceAdmin: boolean;
  userComplianceRole?: 'scientist' | 'lab-manager';
  complianceRole?: 'scientist' | 'lab-manager'; // For analytics - same as userComplianceRole
  path?: string;
  isComplianceManager?: boolean;
  sharedReports: Promise<ComplianceReportSharedWith[]>;
}

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
  // ✅ MINIMAL: Get context (required for user data)
  const ctx = await withAppScopedContext(args, [hhmi.compliance.read], { redirect: true });
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
  // Defer expensive operations
  const sharedReportsPromise = getComplianceReportsSharedWith(ctx.user.id);

  // Build minimal menu immediately (will be enhanced when promises resolve)
  const initialMenu = buildComplianceMenu(
    '/app/compliance',
    isComplianceAdmin,
    !!orcidAccount,
    userComplianceRole,
    [], // Empty initially, will update
  );

  return {
    menu: initialMenu,
    shouldShowSecondaryNav: userComplianceRole !== undefined,
    orcid: orcidAccount?.idAtProvider ?? undefined,
    isComplianceAdmin,
    userComplianceRole,
    complianceRole: userComplianceRole, // For analytics
    path: pathname,
    isComplianceManager: isUserComplianceManager(ctx.user),
    sharedReports: sharedReportsPromise,
  };
}

/**
 * Ensure loader re-runs on navigation to keep menu state fresh.
 * This is critical for ensuring menu items like "Delegate Access" appear
 * after state changes (e.g., ORCID linking, Airtable sync).
 */
export function shouldRevalidate({
  defaultShouldRevalidate,
  currentUrl,
  nextUrl,
}: ShouldRevalidateFunctionArgs) {
  // Always revalidate on navigation between compliance routes to ensure menu is up-to-date
  if (currentUrl && nextUrl) {
    const currentPath = new URL(currentUrl).pathname;
    const nextPath = new URL(nextUrl).pathname;

    // Revalidate when navigating between compliance routes
    if (
      currentPath.startsWith('/app/compliance') &&
      nextPath.startsWith('/app/compliance') &&
      currentPath !== nextPath
    ) {
      return true;
    }
  }

  // Use default behavior for other cases
  return defaultShouldRevalidate;
}

export default function ComplianceLayout() {
  const loaderData = useLoaderData<LoaderData>();
  const {
    menu: initialMenu,
    shouldShowSecondaryNav,
    orcid,
    isComplianceAdmin,
    userComplianceRole,
    sharedReports,
  } = loaderData;

  // Track resolved shared reports
  const [resolvedSharedReports, setResolvedSharedReports] = useState<
    ComplianceReportSharedWith[] | null
  >(null);

  // Create a stable key from loader data to detect when user context changes
  const loaderDataKey = useMemo(
    () => `${orcid || 'no-orcid'}-${isComplianceAdmin}-${userComplianceRole || 'no-role'}`,
    [orcid, isComplianceAdmin, userComplianceRole],
  );

  // Resolve shared reports promise when loader data key changes
  useEffect(() => {
    let isMounted = true;
    const currentKey = loaderDataKey;

    // Reset resolved data when key changes
    setResolvedSharedReports(null);

    // Resolve the promise
    sharedReports
      .then((reports) => {
        // Only update if component is still mounted and key hasn't changed
        if (!isMounted || loaderDataKey !== currentKey) return;
        setResolvedSharedReports(reports);
      })
      .catch((error) => {
        if (!isMounted || loaderDataKey !== currentKey) return;
        console.error('Failed to resolve shared reports:', error);
        // On error, use empty array
        setResolvedSharedReports([]);
      });

    return () => {
      isMounted = false;
    };
  }, [loaderDataKey, sharedReports]);

  // Build menu from resolved data or use initial menu as fallback
  const menu = useMemo(() => {
    if (resolvedSharedReports === null) {
      // Still loading, use initial menu
      return initialMenu;
    }

    // Build menu with resolved shared reports
    return buildComplianceMenu(
      '/app/compliance',
      isComplianceAdmin,
      !!orcid,
      userComplianceRole,
      resolvedSharedReports,
    );
  }, [resolvedSharedReports, initialMenu, isComplianceAdmin, orcid, userComplianceRole]);

  return (
    <>
      {shouldShowSecondaryNav && (
        <SecondaryNav
          contents={menu}
          title={userComplianceRole === 'lab-manager' ? 'Dashboards' : 'My Dashboard'}
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
