// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnownState, MINIMAL_PROOFIG_SERVICE_DATA } from '../../schema.js';

const mocks = vi.hoisted(() => ({
  withAppContext: vi.fn(),
  getPrismaClient: vi.fn(),
  assertWorkChecksReadForRun: vi.fn(),
  patchProofigRunServiceData: vi.fn(),
  enqueueProofigPersistPdfIfNeeded: vi.fn(),
  fileExists: vi.fn(),
  fileReadStream: vi.fn(),
  knownBucketFromCDN: vi.fn(),
  loadChecksRunAnalyticsContext: vi.fn(),
  trackChecksEvent: vi.fn(),
}));

vi.mock('@curvenote/scms-server', () => ({
  withAppContext: (...args: unknown[]) => mocks.withAppContext(...args),
  getPrismaClient: (...args: unknown[]) => mocks.getPrismaClient(...args),
  KnownBuckets: { prv: 'prv', pub: 'pub' },
  StorageBackend: class {
    knownBucketFromCDN(...args: unknown[]) {
      return mocks.knownBucketFromCDN(...args);
    }
  },
  File: class {
    async exists() {
      return mocks.fileExists();
    }
    async readStream() {
      return mocks.fileReadStream();
    }
  },
}));

vi.mock('../../server/checkWorkScopes.server.js', () => ({
  assertWorkChecksReadForRun: (...args: unknown[]) => mocks.assertWorkChecksReadForRun(...args),
}));

vi.mock('../../server/checkRunColumns.server.js', () => ({
  patchProofigRunServiceData: (...args: unknown[]) => mocks.patchProofigRunServiceData(...args),
}));

vi.mock('../../server/enqueue-proofig-persist-pdf.server.js', () => ({
  enqueueProofigPersistPdfIfNeeded: (...args: unknown[]) =>
    mocks.enqueueProofigPersistPdfIfNeeded(...args),
}));

vi.mock('@hhmi/checks-shared/analytics/server', () => ({
  trackChecksEvent: (...args: unknown[]) => mocks.trackChecksEvent(...args),
}));

vi.mock('@hhmi/checks-shared/analytics/runContext.server', () => ({
  loadChecksRunAnalyticsContext: (...args: unknown[]) =>
    mocks.loadChecksRunAnalyticsContext(...args),
}));

import { loader } from './route.js';

const RUN_ID = 'run-1';
const WV_ID = 'wv-1';
const CDN_KEY = 'wv-cdn-key';
const ABS_PATH = `${CDN_KEY}/generated/${RUN_ID}/proofig-report.pdf`;

function storedServiceData(overrides: Record<string, unknown> = {}) {
  return {
    ...MINIMAL_PROOFIG_SERVICE_DATA,
    reportId: 'report-1',
    reportUrl: 'https://proofig.example/r/1',
    proofigReportStored: true,
    storedReportId: 'report-1',
    summary: {
      state: KnownState.ReportClean,
      receivedAt: '2025-01-01T00:00:00Z',
    },
    stages: {
      ...MINIMAL_PROOFIG_SERVICE_DATA.stages,
      resultsReview: {
        status: 'completed',
        history: [],
        timestamp: '2025-01-01T00:00:00Z',
        outcome: 'clean',
      },
    },
    files: {
      [ABS_PATH]: {
        name: 'proofig-report.pdf',
        path: ABS_PATH,
        size: 10,
        type: 'application/pdf',
        md5: 'abc',
        slot: 'generated',
        uploadDate: '2025-01-01T00:00:00Z',
        label: 'Proofig report',
      },
    },
    ...overrides,
  };
}

function makeArgs(id = RUN_ID): Parameters<typeof loader>[0] {
  return {
    params: { id },
    request: new Request(`http://localhost/app/checks-proofig/download-pdf/${id}`),
  } as unknown as Parameters<typeof loader>[0];
}

async function expectThrownStatus(fn: () => Promise<unknown>, status: number) {
  try {
    await fn();
    expect.fail('expected a thrown Response');
  } catch (err) {
    expect(err).toBeInstanceOf(Response);
    expect((err as Response).status).toBe(status);
  }
}

describe('app.checks-proofig.download-pdf loader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.withAppContext.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.assertWorkChecksReadForRun.mockResolvedValue({ ok: true, workId: 'work-1' });
    mocks.knownBucketFromCDN.mockReturnValue('prv');
    mocks.fileExists.mockResolvedValue(true);
    mocks.fileReadStream.mockResolvedValue(new ReadableStream());
    mocks.loadChecksRunAnalyticsContext.mockResolvedValue({ checkKind: 'proofig' });
    mocks.trackChecksEvent.mockResolvedValue(undefined);
    mocks.patchProofigRunServiceData.mockResolvedValue({});
    mocks.enqueueProofigPersistPdfIfNeeded.mockResolvedValue({ enqueued: true, jobId: 'j1' });
    mocks.getPrismaClient.mockResolvedValue({
      checkServiceRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: RUN_ID,
          work_version_id: WV_ID,
          data: { serviceData: storedServiceData() },
        }),
      },
      workVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: WV_ID,
          cdn: 'https://cdn.example',
          cdn_key: CDN_KEY,
        }),
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.withAppContext.mockResolvedValue({ user: null });
    await expectThrownStatus(() => loader(makeArgs()), 401);
  });

  it('returns 403 when work checks read scope is missing', async () => {
    mocks.assertWorkChecksReadForRun.mockResolvedValue({
      ok: false,
      result: { status: 403, error: { message: 'Forbidden' } },
    });
    await expectThrownStatus(() => loader(makeArgs()), 403);
  });

  it('returns 409 stale-stored-report when metadata is for an old report id', async () => {
    mocks.getPrismaClient.mockResolvedValue({
      checkServiceRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: RUN_ID,
          work_version_id: WV_ID,
          data: {
            serviceData: storedServiceData({
              reportId: 'report-2',
              storedReportId: 'report-1',
            }),
          },
        }),
      },
      workVersion: { findUnique: vi.fn() },
    });
    const res = await loader(makeArgs());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe('stale-stored-report');
  });

  it('returns 409 failed when persist error is recorded and nothing is stored', async () => {
    mocks.getPrismaClient.mockResolvedValue({
      checkServiceRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: RUN_ID,
          work_version_id: WV_ID,
          data: {
            serviceData: {
              ...MINIMAL_PROOFIG_SERVICE_DATA,
              reportId: 'report-1',
              reportUrl: 'https://proofig.example/r/1',
              proofigReportPdfError: 'Converter failed: net::ERR_CONNECTION_REFUSED',
              summary: {
                state: KnownState.ReportClean,
                receivedAt: '2025-01-01T00:00:00Z',
              },
              stages: {
                ...MINIMAL_PROOFIG_SERVICE_DATA.stages,
                resultsReview: {
                  status: 'completed',
                  history: [],
                  timestamp: '2025-01-01T00:00:00Z',
                  outcome: 'clean',
                },
              },
            },
          },
        }),
      },
      workVersion: { findUnique: vi.fn() },
    });
    const res = await loader(makeArgs());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      status: 'failed',
      reason: 'persist-failed',
      message: 'Converter failed: net::ERR_CONNECTION_REFUSED',
    });
  });

  it('heals and returns 409 when the CDN object is missing', async () => {
    mocks.fileExists.mockResolvedValue(false);
    const res = await loader(makeArgs());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe('stored-file-missing');
    expect(mocks.patchProofigRunServiceData).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueProofigPersistPdfIfNeeded).toHaveBeenCalledWith(RUN_ID);
  });

  it('streams the PDF when auth, scope, and file are present', async () => {
    const res = await loader(makeArgs());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('logs and contains fire-and-forget analytics rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.trackChecksEvent.mockRejectedValue(new Error('analytics unavailable'));

    const res = await loader(makeArgs());

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        '[proofig] PDF download analytics failed',
        expect.objectContaining({ checkRunId: RUN_ID, err: expect.any(Error) }),
      );
    });
    consoleError.mockRestore();
  });
});
