import { getConfig, sendJobPubSubMessage } from '@curvenote/scms-server';

/**
 * Extension-only `pdfService` settings. Project id and publisher credentials come from
 * main app-config (`api.pubsubProjectId`, `api.converterSASecretKeyfile`).
 */
export type PdfServiceConfig = {
  /** Pub/Sub topic name (id or full resource name). */
  topic: string;
  /** Optional local HTTP stub URL for development pushes (defaults to loopback:8088). When set, also rewrites loopback report hosts for the Docker worker. */
  devLocalPushUrl?: string;
};

/**
 * Read the `pdfService` block from the merged checks-proofig extension config.
 * Returns undefined when `topic` is not set (dispatch should be skipped/soft-failed).
 */
export function readPdfServiceConfig(
  config: Record<string, unknown> | undefined,
): PdfServiceConfig | undefined {
  const raw = config?.pdfService;
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const topic = typeof r.topic === 'string' ? r.topic.trim() : '';
  if (!topic) return undefined;
  return {
    topic,
    devLocalPushUrl:
      typeof r.devLocalPushUrl === 'string' && r.devLocalPushUrl.trim()
        ? r.devLocalPushUrl.trim()
        : undefined,
  };
}

/**
 * Publish a Proofig PDF render job to the Cloud Run worker via Pub/Sub.
 * Thin wrapper over the generic `sendJobPubSubMessage` helper exported by scms-server;
 * all routing (test / dev stub / production) is handled there.
 *
 * Uses the same GCP project + converter SA as converter jobs; only the topic (and optional
 * local push URL) come from the extension `pdfService` block.
 */
export async function dispatchProofigPdfService(
  attributes: Record<string, string>,
  data: Record<string, unknown>,
  pdfService: PdfServiceConfig,
): Promise<string> {
  // Match converter: avoid loading/validating Pub/Sub config when we never publish.
  if (process.env.NODE_ENV === 'test' || process.env.APP_CONFIG_ENV === 'test') {
    return 'testPubSubId';
  }

  const config = await getConfig();
  return sendJobPubSubMessage({
    attributes,
    data,
    pubSub: {
      projectId: config.api.pubsubProjectId ?? 'curvenote-dev-1',
      credentialsJson: config.api.converterSASecretKeyfile ?? '{}',
      topicName: pdfService.topic,
    },
    devLocalPush: { url: pdfService.devLocalPushUrl ?? 'http://127.0.0.1:8088/' },
  });
}
