import type { AllTrackEvent, EventOptions } from '@curvenote/scms-core';
import {
  AnalyticsContext,
  addSegmentAnalytics,
  getConfig,
  type SecureContext,
} from '@curvenote/scms-server';

export type TrackChecksContext = Pick<SecureContext, 'trackEvent' | 'analytics' | 'request'> & {
  user?: SecureContext['user'];
};

export function addChecksPathToPayload(
  ctx: Pick<SecureContext, 'request'>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  let path: string | undefined;
  try {
    path = new URL(ctx.request.url).pathname;
  } catch {
    path = undefined;
  }
  return path ? { ...payload, path } : payload;
}

export async function trackChecksEvent(
  ctx: TrackChecksContext,
  event: AllTrackEvent,
  properties: Record<string, unknown> = {},
  opts: EventOptions = {},
): Promise<void> {
  if (typeof ctx.trackEvent !== 'function') {
    return;
  }

  const payload = addChecksPathToPayload(ctx, {
    ...properties,
    createdByUserId: properties.createdByUserId ?? ctx.user?.id,
  });
  await ctx.trackEvent(event, payload, { ignoreAdmin: true, ...opts });
  if (typeof ctx.analytics?.flush === 'function') {
    await ctx.analytics.flush();
  }
}

/**
 * Track an event attributed to the check run submitter when no signed-in context exists
 * (e.g. provider webhooks).
 */
export async function trackChecksEventForUser(
  userId: string | null | undefined,
  event: AllTrackEvent,
  properties: Record<string, unknown> = {},
  request?: Request,
): Promise<void> {
  if (!userId) {
    console.log('trackChecksEventForUser skipped (no userId):', event);
    return;
  }
  const config = await getConfig();
  const analytics = new AnalyticsContext();
  addSegmentAnalytics(analytics, config.api?.segment);
  await analytics.trackEvent(event, userId, properties, request);
  await analytics.flush();
}
