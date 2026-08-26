// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatus } from '@curvenote/scms-db';
import { KnownState, MINIMAL_PROOFIG_SERVICE_DATA } from '../../schema.js';

const mockFindUniqueRun = vi.fn();
const mockFindUniqueWv = vi.fn();
const mockLinkedCreate = vi.fn();
const mockDbStartJob = vi.fn();
const mockDbUpdateJob = vi.fn();
const mockPatchProofigRunServiceData = vi.fn();
const mockGetProofingToken = vi.fn();
const mockDispatch = vi.fn();
const mockCreateHandshakeToken = vi.fn();
const mockWorkerJobUrl = vi.fn();
const mockGetProofigConfigWithOverrides = vi.fn();

vi.mock('@curvenote/scms-server', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('@curvenote/scms-server')>();
  return {
    ...actual,
    getPrismaClient: vi.fn(async () => ({
      checkServiceRun: { findUnique: mockFindUniqueRun },
      workVersion: { findUnique: mockFindUniqueWv },
      linkedJob: { create: mockLinkedCreate },
    })),
    createHandshakeToken: (...args: unknown[]) => mockCreateHandshakeToken(...args),
    workerJobUrl: (...args: unknown[]) => mockWorkerJobUrl(...args),
    jobs: {
      ...actual.jobs,
      dbStartJob: (...args: unknown[]) => mockDbStartJob(...args),
      dbUpdateJob: (...args: unknown[]) => mockDbUpdateJob(...args),
    },
  };
});

vi.mock('../checkRunColumns.server.js', () => ({
  patchProofigRunServiceData: (...args: unknown[]) => mockPatchProofigRunServiceData(...args),
}));

vi.mock('../proofigAuth.server.js', () => ({
  getProofingToken: (...args: unknown[]) => mockGetProofingToken(...args),
}));

vi.mock('../config.server.js', () => ({
  getProofigConfigWithOverrides: (...args: unknown[]) => mockGetProofigConfigWithOverrides(...args),
}));

vi.mock('../dispatchProofigPdfService.server.js', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('../dispatchProofigPdfService.server.js')>();
  return {
    ...actual,
    dispatchProofigPdfService: (...args: unknown[]) => mockDispatch(...args),
  };
});

vi.mock('uuidv7', () => ({
  uuidv7: () => 'linked-1',
}));

import { PROOFIG_PERSIST_PDF, proofigPersistPdfHandler } from './proofig-persist-pdf.server.js';

const WV_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = 'run-1';

function finalServiceData(overrides: Record<string, unknown> = {}) {
  return {
    ...MINIMAL_PROOFIG_SERVICE_DATA,
    reportId: 'report-1',
    reportUrl: 'https://proofig.example/report/1',
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
    ...overrides,
  };
}

function makeCtx(ext: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1' },
    $config: {
      api: {
        handshakeIssuer: 'iss',
        handshakeSigningSecret: 'sec',
      },
      app: {
        extensions: {
          'checks-proofig': ext,
        },
      },
    },
  } as any;
}

function makeJob(payload: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    job_type: PROOFIG_PERSIST_PDF,
    payload: {
      work_version_id: WV_ID,
      check_service_run_id: RUN_ID,
      report_id: 'report-1',
      ...payload,
    },
  } as any;
}

describe('proofigPersistPdfHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbStartJob.mockResolvedValue({ id: 'job-1', date_created: new Date() });
    mockDbUpdateJob.mockImplementation(async (id, update) => ({ id, ...update }));
    mockLinkedCreate.mockResolvedValue({ id: 'linked-1' });
    mockPatchProofigRunServiceData.mockResolvedValue({});
    mockCreateHandshakeToken.mockReturnValue('handshake-token');
    mockWorkerJobUrl.mockReturnValue('http://localhost:3031/v1/jobs/job-1');
    mockGetProofingToken.mockResolvedValue('access-token');
    mockDispatch.mockResolvedValue('pubsub-1');
    mockFindUniqueWv.mockResolvedValue({
      id: WV_ID,
      cdn: 'cdn-1',
      cdn_key: 'key/1',
    });
    mockFindUniqueRun.mockResolvedValue({
      id: RUN_ID,
      work_version_id: WV_ID,
      data: { serviceData: finalServiceData() },
    });
    mockGetProofigConfigWithOverrides.mockImplementation(async (base) => ({
      ...base,
      apiBaseUrl: 'https://proofig.api',
      pdfService: { topic: 'proofigPdfTopic' },
    }));
  });

  it('completes as skipped when a current PDF is already stored (idempotent)', async () => {
    mockFindUniqueRun.mockResolvedValue({
      id: RUN_ID,
      work_version_id: WV_ID,
      data: {
        serviceData: finalServiceData({
          proofigReportStored: true,
          storedReportId: 'report-1',
        }),
      },
    });

    await proofigPersistPdfHandler(makeCtx(), makeJob());

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockDbUpdateJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        status: JobStatus.COMPLETED,
        results: expect.objectContaining({ skipped: true }),
      }),
    );
  });

  it('fails when no report URL is stored', async () => {
    mockFindUniqueRun.mockResolvedValue({
      id: RUN_ID,
      work_version_id: WV_ID,
      data: {
        serviceData: finalServiceData({
          reportUrl: undefined,
          summary: { state: KnownState.ReportClean, receivedAt: '2025-01-01T00:00:00Z' },
        }),
      },
    });

    // force bypasses the shouldPersist gate so the explicit no-URL failure path runs.
    await proofigPersistPdfHandler(makeCtx(), makeJob({ force: true }));

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockPatchProofigRunServiceData).toHaveBeenCalled();
    expect(mockDbUpdateJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: JobStatus.FAILED }),
    );
  });

  it('fails when pdfService.topic is not configured', async () => {
    mockGetProofigConfigWithOverrides.mockResolvedValue({
      apiBaseUrl: 'https://proofig.api',
    });

    await proofigPersistPdfHandler(makeCtx(), makeJob());

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockDbUpdateJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        status: JobStatus.FAILED,
        message: expect.stringMatching(/pdfService\.topic/i),
      }),
    );
  });

  it('fails when publish throws', async () => {
    mockDispatch.mockRejectedValue(new Error('pubsub down'));

    await proofigPersistPdfHandler(makeCtx(), makeJob());

    const updater = mockPatchProofigRunServiceData.mock.calls[0][1] as (sd: any) => any;
    expect(updater(finalServiceData()).proofigReportPdfFailedReportId).toBe('report-1');
    expect(mockDbUpdateJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        status: JobStatus.FAILED,
        message: expect.stringContaining('pubsub down'),
      }),
    );
  });

  it('publishes with targeted report_id and keeps the job RUNNING on success', async () => {
    await proofigPersistPdfHandler(makeCtx(), makeJob());

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        handshake: 'handshake-token',
        jobUrl: 'http://localhost:3031/v1/jobs/job-1',
        userId: 'user-1',
      }),
      expect.objectContaining({
        check_service_run_id: RUN_ID,
        work_version_id: WV_ID,
        report_id: 'report-1',
        reportUrl: expect.stringContaining('access-token'),
      }),
      expect.objectContaining({ topic: 'proofigPdfTopic' }),
    );
    expect(mockDbUpdateJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        status: JobStatus.RUNNING,
        results: expect.objectContaining({ pubsubMessageId: 'pubsub-1' }),
      }),
    );
  });

  it('uses serviceData.reportId when the job payload omits report_id', async () => {
    await proofigPersistPdfHandler(makeCtx(), makeJob({ report_id: undefined }));

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ report_id: 'report-1' }),
      expect.any(Object),
    );
  });
});
