'use client';

import { usePingEvent, type EventOptions } from '@curvenote/scms-core';
import { useLocation } from 'react-router';
import type { ChecksAnalyticsBase, ChecksKind } from './properties.js';

export type UseChecksPingEventOptions = {
  checkKind: ChecksKind;
  workVersionId?: string;
  workId?: string;
};

export function useChecksPingEvent({
  checkKind,
  workVersionId,
  workId,
}: UseChecksPingEventOptions) {
  const pingEvent = usePingEvent();
  const location = useLocation();

  return async (
    event: string,
    properties: Record<string, unknown> = {},
    opts: EventOptions = {},
  ): Promise<void> => {
    const base: Partial<ChecksAnalyticsBase> = {
      checkKind,
      path: location.pathname,
    };
    if (workVersionId) base.workVersionId = workVersionId;
    if (workId) base.workId = workId;

    await pingEvent(
      event,
      {
        ...base,
        ...properties,
      },
      { ignoreAdmin: true, ...opts },
    );
  };
}
