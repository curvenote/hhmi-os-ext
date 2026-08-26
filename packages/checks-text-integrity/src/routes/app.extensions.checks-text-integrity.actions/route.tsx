import { data } from 'react-router';
import { withAppContext } from '@curvenote/scms-server';
import { handleTextIntegrityAction } from '../../server/actions.js';
import { extension as textIntegrityServerExtension } from '../../server.js';

export async function loader() {
  return data(
    { error: { type: 'general', message: 'Method Not Allowed' } },
    {
      status: 405,
      headers: { Allow: 'POST' },
    },
  );
}

export async function action(args: Parameters<typeof withAppContext>[0]) {
  const ctx = await withAppContext(args);
  if (!ctx.user) {
    return data(
      { error: { type: 'general', message: 'Authentication required' } },
      { status: 401 },
    );
  }
  const formData = await args.request.formData();
  const intent = formData.get('intent')?.toString().trim();
  const workVersionId = formData.get('workVersionId')?.toString().trim();

  if (!intent) {
    return data({ error: { type: 'general', message: 'intent is required' } }, { status: 400 });
  }
  if (!workVersionId) {
    return data(
      { error: { type: 'general', message: 'workVersionId is required' } },
      { status: 400 },
    );
  }

  return handleTextIntegrityAction({
    intent,
    workVersionId,
    formData,
    ctx,
    serverExtensions: [textIntegrityServerExtension],
  });
}
