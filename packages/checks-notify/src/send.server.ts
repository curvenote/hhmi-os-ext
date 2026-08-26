import { withBaseUrl } from '@curvenote/scms-core';
import { $sendSlackNotification, getConfig, type SlackMessage } from '@curvenote/scms-server';
import type { CheckRunContext } from './types.js';
import { asTextIntegrityPdfDownloadUrl, asWorkIntegrityUrl } from './urls.js';

type SlackConfig = { webhookUrl?: string; disabled?: boolean };

type SlackConfigSource =
  | { api?: { slack?: SlackConfig } }
  | { sendSlackNotification: (message: SlackMessage) => Promise<void> };

function isContextWithSendSlack(
  source: SlackConfigSource,
): source is { sendSlackNotification: (message: SlackMessage) => Promise<void> } {
  return (
    typeof (source as { sendSlackNotification?: unknown }).sendSlackNotification === 'function'
  );
}

/** Send Slack notification without blocking callers on failure. */
export async function sendCheckSlack(
  source: SlackConfigSource | undefined,
  message: SlackMessage,
): Promise<void> {
  try {
    if (!source) return;
    if (isContextWithSendSlack(source)) {
      await source.sendSlackNotification(message);
      return;
    }
    const slackConfig = source.api?.slack;
    await $sendSlackNotification(message, slackConfig);
  } catch (err) {
    console.error('[checks-notify] Slack notification failed', err);
  }
}

/** Resolve config and send (for webhook routes without ctx). */
export async function sendCheckSlackFromConfig(message: SlackMessage): Promise<void> {
  try {
    const config = await getConfig();
    await $sendSlackNotification(message, config.api?.slack);
  } catch (err) {
    console.error('[checks-notify] Slack notification failed', err);
  }
}

export type CheckSlackUrlOptions = {
  request?: Request;
  asBaseUrl?: (path: string) => string;
};

export function resolveCheckSlackUrls(
  runContext: Pick<CheckRunContext, 'workId' | 'checkRunId'>,
  options: CheckSlackUrlOptions = {},
): { workUrl?: string; pdfDownloadUrl?: string } {
  const asBaseUrl =
    options.asBaseUrl ?? (options.request ? withBaseUrl(options.request) : undefined);
  if (!asBaseUrl) return {};
  return {
    workUrl: asWorkIntegrityUrl(asBaseUrl, runContext.workId),
    pdfDownloadUrl: asTextIntegrityPdfDownloadUrl(asBaseUrl, runContext.checkRunId),
  };
}

export function buildCheckRunMetadata(
  runContext: CheckRunContext,
  extra: Record<string, unknown> = {},
  urlOptions: CheckSlackUrlOptions = {},
): Record<string, unknown> {
  const urls = resolveCheckSlackUrls(runContext, urlOptions);
  return {
    checkKind: runContext.checkKind,
    checkRunId: runContext.checkRunId,
    workVersionId: runContext.workVersionId,
    ...(runContext.workId ? { workId: runContext.workId } : {}),
    ...(urls.workUrl ? { workUrl: urls.workUrl } : {}),
    ...(urls.pdfDownloadUrl ? { pdfDownloadUrl: urls.pdfDownloadUrl } : {}),
    ...extra,
  };
}
