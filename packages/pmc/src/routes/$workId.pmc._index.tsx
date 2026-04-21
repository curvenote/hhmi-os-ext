import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { withSecureWorkContext } from '@curvenote/scms-server';
import { work as workScopes } from '@curvenote/scms-core';

export async function loader(args: LoaderFunctionArgs) {
  const ctx = await withSecureWorkContext(args, [workScopes.id.submissions.read]);
  throw redirect(`/app/works/${ctx.work.id}`);
}
