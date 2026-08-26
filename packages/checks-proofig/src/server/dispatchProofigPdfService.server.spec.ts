// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { readPdfServiceConfig } from './dispatchProofigPdfService.server.js';

describe('readPdfServiceConfig', () => {
  it('returns undefined when pdfService is missing', () => {
    expect(readPdfServiceConfig({})).toBeUndefined();
    expect(readPdfServiceConfig(undefined)).toBeUndefined();
  });

  it('returns undefined when topic is empty', () => {
    expect(readPdfServiceConfig({ pdfService: { topic: '  ' } })).toBeUndefined();
    expect(readPdfServiceConfig({ pdfService: {} })).toBeUndefined();
  });

  it('reads topic and optional devLocalPushUrl only', () => {
    expect(
      readPdfServiceConfig({
        pdfService: {
          topic: 'proofigPdfServiceTopic',
          projectId: 'ignored',
          credentialsJson: 'ignored',
          devLocalPushUrl: 'http://127.0.0.1:8088/',
        },
      }),
    ).toEqual({
      topic: 'proofigPdfServiceTopic',
      devLocalPushUrl: 'http://127.0.0.1:8088/',
    });
  });
});
