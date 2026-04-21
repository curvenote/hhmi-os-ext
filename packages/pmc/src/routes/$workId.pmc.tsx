import type { LoaderFunctionArgs } from 'react-router';
import { redirect, Outlet } from 'react-router';
import { withSecureWorkContext } from '@curvenote/scms-server';
import { work } from '@curvenote/scms-core';

export const loader = async (args: LoaderFunctionArgs) => {
  const ctx = await withSecureWorkContext(args, [work.id.submissions.read]);
  // Check if PMC extension is enabled and work has versions
  if (!ctx.$config.app.extensions?.pmc || !ctx.work.versions || ctx.work.versions.length === 0) {
    return redirect('/app/works');
  }
  return null;
};

export default function PMCLayout() {
  return (
    <div data-name="pmc-layout">
      <Outlet />
    </div>
  );
}
