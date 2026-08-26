import { describe, expect, it } from 'vitest';
import {
  proofigReportUrlWithAccessToken,
  rewriteReportUrlForDockerWorker,
} from './proofigReportUrl.server.js';

describe('proofigReportUrlWithAccessToken', () => {
  it('replaces token and keeps id and origin', () => {
    expect(
      proofigReportUrlWithAccessToken(
        'https://proofig.example/auto/Curvenotelogin?id=rep-1&token=old',
        'new.jwt',
      ),
    ).toBe('https://proofig.example/auto/Curvenotelogin?id=rep-1&token=new.jwt');
  });

  it('adds token when missing', () => {
    expect(
      proofigReportUrlWithAccessToken('https://proofig.example/auto/Curvenotelogin?id=rep-2', 't'),
    ).toBe('https://proofig.example/auto/Curvenotelogin?id=rep-2&token=t');
  });

  it('throws on invalid URL', () => {
    expect(() => proofigReportUrlWithAccessToken('not-a-url', 't')).toThrow(/valid absolute URL/);
  });
});

describe('rewriteReportUrlForDockerWorker', () => {
  it('rewrites localhost to host.docker.internal', () => {
    expect(
      rewriteReportUrlForDockerWorker(
        'http://localhost:5173/auto/Curvenotelogin?id=rep-1&token=abc',
      ),
    ).toBe('http://host.docker.internal:5173/auto/Curvenotelogin?id=rep-1&token=abc');
  });

  it('rewrites 127.0.0.1 to host.docker.internal', () => {
    expect(rewriteReportUrlForDockerWorker('http://127.0.0.1:5173/report?token=t')).toBe(
      'http://host.docker.internal:5173/report?token=t',
    );
  });

  it('leaves non-loopback hosts unchanged', () => {
    expect(
      rewriteReportUrlForDockerWorker('https://proofig.example/auto/Curvenotelogin?id=1&token=t'),
    ).toBe('https://proofig.example/auto/Curvenotelogin?id=1&token=t');
  });

  it('throws on invalid URL', () => {
    expect(() => rewriteReportUrlForDockerWorker('not-a-url')).toThrow(/valid absolute URL/);
  });
});
