import { redirect } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  SiteContextWithUser,
  sites,
  withAppContext,
  userHasSiteScope,
  throwRedirectOr403,
  throwRedirectOr404,
} from '@curvenote/scms-server';
import { httpError } from '@curvenote/scms-core';
import { SystemRole } from '@curvenote/scms-db';

export async function withAppPMCContext<T extends LoaderFunctionArgs | ActionFunctionArgs>(
  args: T,
  scopes: string[],
  opts: { redirectTo?: string; redirect?: boolean } = { redirectTo: '/app' },
): Promise<SiteContextWithUser> {
  const ctx = await withAppContext(args);

  const site = await sites.dbGetSite('pmc');
  if (!site || !site.metadata) throw httpError(404, 'Site not found');
  if (args.request.url.endsWith('/pmc')) throw redirect('/app/sites/pmc/inbox');

  const siteCtx = new SiteContextWithUser(ctx, site);

  // User has no permission on the site
  if (ctx.user.system_role !== SystemRole.ADMIN && ctx.user.site_roles.length === 0) {
    throw throwRedirectOr404(opts);
  }
  // User does not have a correct scope on the site
  if (!scopes.find((scope) => userHasSiteScope(ctx.user, scope, site.id))) {
    console.warn(
      'withAppSiteContext',
      args.request.url,
      'user does not have a correct scope on the site',
      scopes,
    );
    throw throwRedirectOr403(opts);
  }

  return siteCtx;
}
