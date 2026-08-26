import { formatDate } from '@curvenote/scms-core';
import type { RetrySupersessionInfo } from '../schema.js';

type RetriedRunNoticeProps = {
  supersession: RetrySupersessionInfo;
};

export function RetriedRunNotice({ supersession }: RetriedRunNoticeProps) {
  return (
    <p className="text-sm text-muted-foreground">
      This check was retried on{' '}
      <time dateTime={supersession.supersededAt}>
        {formatDate(supersession.supersededAt, 'MMM d, yyyy h:mm a')}
      </time>
      .
    </p>
  );
}
