// eslint-disable-next-line import/no-extraneous-dependencies
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MINIMAL_TEXT_INTEGRITY_SERVICE_DATA } from '../schema.js';
import { fetchSimilarityReportPdfFromRelay } from './fetch-similarity-report-from-relay.server.js';

const serviceData = {
  ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
  externalId: 'tca-sub-1',
  reportPdfId: 'pdf-1',
};

const relay = { relayBaseUrl: 'https://relay.example.com', relayApiKey: 'secret' };

async function expectHttpErrorMessage(promise: Promise<unknown>, expected: string) {
  try {
    await promise;
    expect.fail('expected HTTP error response');
  } catch (err) {
    expect(err).toBeInstanceOf(Response);
    const body = (await (err as Response).json()) as { message?: string };
    expect(body.message).toContain(expected);
  }
}

describe('fetchSimilarityReportPdfFromRelay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects successful non-PDF responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not ready', {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      ),
    );

    await expectHttpErrorMessage(
      fetchSimilarityReportPdfFromRelay(relay, 'ithenticate', 'default', serviceData),
      'non-PDF',
    );
  });

  it('returns valid PDF bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('%PDF-1.7\nbody', {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      ),
    );

    const result = await fetchSimilarityReportPdfFromRelay(
      relay,
      'ithenticate',
      'default',
      serviceData,
    );

    expect(Buffer.from(result.bytes).toString('utf8')).toContain('%PDF-1.7');
  });
});
