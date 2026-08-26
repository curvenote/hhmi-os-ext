// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatus } from '@curvenote/scms-db';
import { KnownState, MINIMAL_PROOFIG_SERVICE_DATA } from '../schema.js';

const mockEnqueueAndDispatchJob = vi.fn();
const mockGetConfig = vi.fn();
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockPatchProofigRunServiceData = vi.fn();
let uuidSeq = 0;

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    checkServiceRun: { findUnique: mockFindUnique },
    job: { findFirst: mockFindFirst, findMany: mockFindMany },
  })),
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
  enqueueAndDispatchJob: (...args: unknown[]) => mockEnqueueAndDispatchJob(...args),
}));

vi.mock('./checkRunColumns.server.js', () => ({
  patchProofigRunServiceData: (...args: unknown[]) => mockPatchProofigRunServiceData(...args),
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => {
    uuidSeq += 1;
    return `job-new-${uuidSeq}`;
  },
}));

import {
  enqueueProofigPersistPdfFollowUpIfNeeded,
  enqueueProofigPersistPdfIfNeeded,
} from './enqueue-proofig-persist-pdf.server.js';

function finalReportServiceData(overrides: Record<string, unknown> = {}) {
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

describe('enqueueProofigPersistPdfIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidSeq = 0;
    mockGetConfig.mockResolvedValue({
      api: { submissionsServiceAccount: { id: 'svc-1' } },
    });
    mockEnqueueAndDispatchJob.mockResolvedValue(undefined);
    mockFindFirst.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    mockPatchProofigRunServiceData.mockResolvedValue({});
  });

  it('skips when a PROOFIG_PERSIST_PDF job is already in flight for the run', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: { serviceData: finalReportServiceData() },
    });
    mockFindFirst.mockResolvedValue({ id: 'job-existing' });

    const result = await enqueueProofigPersistPdfIfNeeded('run-1');

    expect(result).toEqual({ enqueued: false, reason: 'already-in-flight' });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          job_type: 'PROOFIG_PERSIST_PDF',
          status: {
            in: [JobStatus.BLOCKED, JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.SCHEDULED],
          },
          payload: {
            path: ['check_service_run_id'],
            equals: 'run-1',
          },
        }),
        select: { id: true },
      }),
    );
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockEnqueueAndDispatchJob).not.toHaveBeenCalled();
  });

  it('enqueues when persist is needed and no job is in flight', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: { serviceData: finalReportServiceData() },
    });

    const result = await enqueueProofigPersistPdfIfNeeded('run-1');

    expect(result).toEqual({ enqueued: true, jobId: 'job-new-1' });
    expect(mockPatchProofigRunServiceData).toHaveBeenCalledTimes(1);
    expect(mockEnqueueAndDispatchJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueAndDispatchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: 'job-new-1',
        job_type: 'PROOFIG_PERSIST_PDF',
        dependents: [
          expect.objectContaining({
            job_id: 'job-new-2',
            job_type: 'PROOFIG_PERSIST_PDF_FAILURE_CLEANUP',
            trigger_on: 'failure',
          }),
        ],
      }),
    );
    const enqueuedJob = mockEnqueueAndDispatchJob.mock.calls[0][0];
    expect(enqueuedJob).not.toHaveProperty('activity_type');
    expect(enqueuedJob).not.toHaveProperty('activity_data');
  });

  it('skips when a prior PDF failure is recorded (unless force)', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: {
        serviceData: finalReportServiceData({
          proofigReportPdfError: 'Converter failed: net::ERR_CONNECTION_REFUSED',
        }),
      },
    });

    const skipped = await enqueueProofigPersistPdfIfNeeded('run-1');
    expect(skipped).toEqual({ enqueued: false, reason: 'prior-failure' });
    expect(mockEnqueueAndDispatchJob).not.toHaveBeenCalled();

    const forced = await enqueueProofigPersistPdfIfNeeded('run-1', { force: true });
    expect(forced).toEqual({ enqueued: true, jobId: 'job-new-1' });
    expect(mockEnqueueAndDispatchJob).toHaveBeenCalledTimes(1);
  });

  it('auto-enqueues when the recorded failure targeted a prior report', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: {
        serviceData: finalReportServiceData({
          reportId: 'report-2',
          proofigReportPdfError: 'render failed for report-1',
          proofigReportPdfFailedReportId: 'report-1',
        }),
      },
    });

    const result = await enqueueProofigPersistPdfIfNeeded('run-1');

    expect(result).toEqual({ enqueued: true, jobId: 'job-new-1' });
    expect(mockEnqueueAndDispatchJob).toHaveBeenCalledTimes(1);
  });

  it('conservatively suppresses auto-retry for a legacy unscoped failure', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: {
        serviceData: finalReportServiceData({
          reportId: 'report-2',
          proofigReportPdfError: 'legacy render failure',
        }),
      },
    });

    const result = await enqueueProofigPersistPdfIfNeeded('run-1');

    expect(result).toEqual({ enqueued: false, reason: 'prior-failure' });
    expect(mockEnqueueAndDispatchJob).not.toHaveBeenCalled();
  });

  it('force enqueues when no in-flight job exists (stored report recovery)', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: {
        serviceData: finalReportServiceData({
          proofigReportStored: true,
          storedReportId: 'report-1',
        }),
      },
    });
    mockFindMany.mockResolvedValue([]);

    const result = await enqueueProofigPersistPdfIfNeeded('run-1', { force: true });

    expect(result).toEqual({ enqueued: true, jobId: 'job-new-1' });
    expect(mockEnqueueAndDispatchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ force: true }),
      }),
    );
    // Force regenerate stamps requestedAt but keeps stored metadata so Download survives a failed re-render.
    expect(mockPatchProofigRunServiceData).toHaveBeenCalledTimes(1);
    const patcher = mockPatchProofigRunServiceData.mock.calls[0][1] as (sd: {
      proofigReportStored?: boolean;
      storedReportId?: string;
      proofigReportPdfError?: string;
      proofigReportPdfFailedReportId?: string;
      proofigReportPdfRequestedAt?: string;
    }) => {
      proofigReportStored?: boolean;
      storedReportId?: string;
      proofigReportPdfError?: string;
      proofigReportPdfFailedReportId?: string;
      proofigReportPdfRequestedAt?: string;
    };
    const stamped = patcher({
      proofigReportStored: true,
      storedReportId: 'report-1',
      proofigReportPdfError: 'prior',
      proofigReportPdfFailedReportId: 'report-1',
    });
    expect(stamped.proofigReportStored).toBe(true);
    expect(stamped.storedReportId).toBe('report-1');
    expect(stamped.proofigReportPdfError).toBeUndefined();
    expect(stamped.proofigReportPdfFailedReportId).toBeUndefined();
    expect(stamped.proofigReportPdfRequestedAt).toEqual(expect.any(String));
  });

  it('force skips when a fresh in-flight PROOFIG_PERSIST_PDF job exists', async () => {
    const freshCreatedAt = new Date(Date.now() - 60_000).toISOString();
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: {
        serviceData: finalReportServiceData({
          proofigReportStored: true,
          storedReportId: 'report-1',
          proofigReportPdfRequestedAt: freshCreatedAt,
        }),
      },
    });
    mockFindMany.mockResolvedValue([{ id: 'job-existing', date_created: freshCreatedAt }]);

    const result = await enqueueProofigPersistPdfIfNeeded('run-1', { force: true });

    expect(result).toEqual({ enqueued: false, reason: 'already-in-flight' });
    expect(mockEnqueueAndDispatchJob).not.toHaveBeenCalled();
  });

  it('force still enqueues when the in-flight job is stale (stuck recovery)', async () => {
    const staleCreatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: {
        serviceData: finalReportServiceData({
          proofigReportStored: true,
          storedReportId: 'report-1',
          proofigReportPdfRequestedAt: staleCreatedAt,
        }),
      },
    });
    mockFindMany.mockResolvedValue([{ id: 'job-stuck', date_created: staleCreatedAt }]);

    const result = await enqueueProofigPersistPdfIfNeeded('run-1', { force: true });

    expect(result).toEqual({ enqueued: true, jobId: 'job-new-1' });
    expect(mockEnqueueAndDispatchJob).toHaveBeenCalledTimes(1);
  });

  it('force refuses when findMany returns stale row first but a newer fresh job is also in flight', async () => {
    const staleCreatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const freshCreatedAt = new Date(Date.now() - 60_000).toISOString();
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: {
        serviceData: finalReportServiceData({
          proofigReportStored: true,
          storedReportId: 'report-1',
        }),
      },
    });
    // Unordered/stale-first result mimics findFirst returning the wrong row.
    mockFindMany.mockResolvedValue([
      { id: 'job-stale', date_created: staleCreatedAt },
      { id: 'job-fresh', date_created: freshCreatedAt },
    ]);

    const result = await enqueueProofigPersistPdfIfNeeded('run-1', { force: true });

    expect(result).toEqual({ enqueued: false, reason: 'already-in-flight' });
    expect(mockEnqueueAndDispatchJob).not.toHaveBeenCalled();
  });

  it('force enqueues when all in-flight jobs are stale (stuck recovery)', async () => {
    const staleCreatedAtA = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const staleCreatedAtB = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: {
        serviceData: finalReportServiceData({
          proofigReportStored: true,
          storedReportId: 'report-1',
          proofigReportPdfRequestedAt: staleCreatedAtA,
        }),
      },
    });
    mockFindMany.mockResolvedValue([
      { id: 'job-stale-a', date_created: staleCreatedAtA },
      { id: 'job-stale-b', date_created: staleCreatedAtB },
    ]);

    const result = await enqueueProofigPersistPdfIfNeeded('run-1', { force: true });

    expect(result).toEqual({ enqueued: true, jobId: 'job-new-1' });
    expect(mockEnqueueAndDispatchJob).toHaveBeenCalledTimes(1);
  });

  it('force skips when a fresh request stamp exists but no job is visible yet', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: {
        serviceData: finalReportServiceData({
          proofigReportPdfRequestedAt: new Date().toISOString(),
        }),
      },
    });
    mockFindMany.mockResolvedValue([]);

    const result = await enqueueProofigPersistPdfIfNeeded('run-1', { force: true });

    expect(result).toEqual({ enqueued: false, reason: 'already-in-flight' });
    expect(mockEnqueueAndDispatchJob).not.toHaveBeenCalled();
  });

  it('stamps proofigReportPdfRequestedAt on enqueue (non-force)', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: { serviceData: finalReportServiceData() },
    });

    await enqueueProofigPersistPdfIfNeeded('run-1');

    const patcher = mockPatchProofigRunServiceData.mock.calls[0][1] as (sd: {
      proofigReportPdfError?: string;
      proofigReportPdfRequestedAt?: string;
    }) => {
      proofigReportPdfError?: string;
      proofigReportPdfRequestedAt?: string;
    };
    const patched = patcher({
      proofigReportPdfError: 'old',
    });
    expect(patched.proofigReportPdfError).toBeUndefined();
    expect(patched.proofigReportPdfRequestedAt).toEqual(expect.any(String));
  });

  it('stamps report_id on the job payload when known', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: { serviceData: finalReportServiceData() },
    });

    await enqueueProofigPersistPdfIfNeeded('run-1');

    expect(mockEnqueueAndDispatchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ report_id: 'report-1' }),
      }),
    );
  });

  it('follow-up enqueues when stored report id is stale vs current reportId', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: {
        serviceData: finalReportServiceData({
          reportId: 'report-2',
          proofigReportStored: true,
          storedReportId: 'report-1',
        }),
      },
    });

    const result = await enqueueProofigPersistPdfFollowUpIfNeeded('run-1', {
      excludeJobId: 'job-old',
      jobReportId: 'report-1',
    });

    expect(result).toEqual({ enqueued: true, jobId: 'job-new-1' });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'job-old' },
        }),
      }),
    );
  });

  it('follow-up does not auto-retry when job targeted the current report id', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: '11111111-1111-4111-8111-111111111111',
      data: { serviceData: finalReportServiceData() },
    });

    const result = await enqueueProofigPersistPdfFollowUpIfNeeded('run-1', {
      excludeJobId: 'job-old',
      jobReportId: 'report-1',
    });

    expect(result).toEqual({ enqueued: false, reason: 'same-report-no-auto-retry' });
    expect(mockEnqueueAndDispatchJob).not.toHaveBeenCalled();
  });
});
