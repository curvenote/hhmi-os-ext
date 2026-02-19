import { useFetcher } from 'react-router';
import { LoadingSpinner, ui } from '@curvenote/scms-core';

export function UpdateAirtableCacheButton() {
  const fetcher = useFetcher();
  const isBusy = fetcher.state !== 'idle';
  const error =
    fetcher.data && typeof fetcher.data === 'object' && 'error' in fetcher.data
      ? (fetcher.data as { error: { message?: string } }).error?.message
      : null;

  return (
    <div className="flex flex-col gap-1 items-end">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="update-airtable-cache" />
        <div className="flex gap-1 items-center">
          {isBusy && <LoadingSpinner size={16} color="text-blue-600" />}
          <ui.Button type="submit" variant="link" className="cursor-pointer" disabled={isBusy}>
            Not seeing the latest data? Click to update
          </ui.Button>
        </div>
      </fetcher.Form>
      {error && (
        <span className="text-sm text-destructive" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
