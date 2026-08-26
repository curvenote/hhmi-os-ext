import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderReportPdf: vi.fn(),
}));

vi.mock('./pdf/renderReportPdf.js', () => ({
  renderReportPdf: (...args: unknown[]) => mocks.renderReportPdf(...args),
}));

import { createService, handleProductionJob, sanitizeWorkerError } from './service.js';
import {
  proofigReportStoragePath,
  validateProofigPdfPayload,
  validateRenderOnlyRequest,
} from './payload.js';
import { isRenderOnlyTestMode } from './renderOnlyTestMode.js';

describe('proofig-pdf-service', () => {
  afterEach(() => {
    delete process.env.PROOFIG_PDF_RENDER_ONLY;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a service instance with get/post handlers', () => {
    const service = createService();
    expect(service).toBeDefined();
    expect(typeof service.get).toBe('function');
    expect(typeof service.post).toBe('function');
  });

  it('detects render-only test mode from env', () => {
    expect(isRenderOnlyTestMode()).toBe(false);
    process.env.PROOFIG_PDF_RENDER_ONLY = '1';
    expect(isRenderOnlyTestMode()).toBe(true);
  });

  it('validates render-only request body', () => {
    const body = validateRenderOnlyRequest({
      reportUrl: 'https://proofig.example.com/report?token=abc',
    });
    expect(body.reportUrl).toContain('proofig.example.com');
  });

  it('builds a relative storage path under generated/', () => {
    expect(proofigReportStoragePath('run-123')).toBe('generated/run-123/proofig-report.pdf');
  });

  it('validates a well-formed payload', () => {
    const payload = validateProofigPdfPayload({
      reportUrl: 'https://proofig.example.com/report?token=abc',
      work_version_id: 'wv-1',
      check_service_run_id: 'run-1',
      cdn: 'cdn-1',
      cdn_key: 'key/1',
    });
    expect(payload.reportUrl).toContain('proofig.example.com');
  });

  it('rejects a payload missing required fields', () => {
    expect(() => validateProofigPdfPayload({ reportUrl: 'not-a-url' })).toThrow(
      /Invalid proofig-pdf payload/,
    );
  });

  it('sanitizes URL query strings in Error and non-Error failures', () => {
    expect(
      sanitizeWorkerError(
        new Error(
          'page.goto: net::ERR_FAILED at https://proofig.example/report?token=secret&view=print',
        ),
      ),
    ).toBe('page.goto: net::ERR_FAILED at https://proofig.example/report');
    expect(sanitizeWorkerError('failed at https://proofig.example/report?token=secret')).toBe(
      'failed at https://proofig.example/report',
    );
  });

  it('sanitizes render failures before they escape the production handler', async () => {
    mocks.renderReportPdf.mockRejectedValueOnce(
      new Error(
        'page.goto: net::ERR_FAILED at https://proofig.example/report?token=secret&view=print',
      ),
    );

    const promise = handleProductionJob({
      payload: {
        reportUrl: 'https://proofig.example/report?token=secret&view=print',
        work_version_id: 'wv-1',
        check_service_run_id: 'run-1',
        cdn: 'cdn-1',
        cdn_key: 'key/1',
      },
      tmpFolder: '/tmp/proofig',
      attributes: { handshake: 'handshake' },
    } as unknown as Parameters<typeof handleProductionJob>[0]);

    await expect(promise).rejects.toThrow(
      'page.goto: net::ERR_FAILED at https://proofig.example/report',
    );
    await expect(promise).rejects.not.toThrow(/token=secret/);
  });

  it('keeps the successful production flow unchanged', async () => {
    mocks.renderReportPdf.mockResolvedValueOnce({
      localPath: fileURLToPath(import.meta.url),
      size: 123,
    });
    const uploadSingleFileToCdn = vi.fn().mockResolvedValue({ path: 'key/1/generated/report.pdf' });
    const completed = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    await handleProductionJob({
      client: {
        works: { getBaseUrl: () => 'https://scms.example/v1' },
        uploads: { uploadSingleFileToCdn },
        jobs: { completed },
      },
      payload: {
        reportUrl: 'https://proofig.example/report?token=secret',
        work_version_id: 'wv-1',
        check_service_run_id: 'run-1',
        cdn: 'cdn-1',
        cdn_key: 'key/1',
      },
      tmpFolder: '/tmp/proofig',
      attributes: { handshake: 'handshake' },
      res: {},
    } as unknown as Parameters<typeof handleProductionJob>[0]);

    expect(uploadSingleFileToCdn).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://scms.example/v1/hooks/proofig/pdf-stored/run-1',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(completed).toHaveBeenCalledTimes(1);
  });
});
