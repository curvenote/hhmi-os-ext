// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { JobStatus } from '@curvenote/scms-db';

const mockPatchProofigRunServiceData = vi.fn();
const mockEnqueueFollowUp = vi.fn();
const mockDbUpdateJob = vi.fn();
const mockFindUnique = vi.fn();

vi.mock('../checkRunColumns.server.js', () => ({
  patchProofigRunServiceData: (...args: unknown[]) => mockPatchProofigRunServiceData(...args),
}));

vi.mock('../enqueue-proofig-persist-pdf.server.js', () => ({
  enqueueProofigPersistPdfFollowUpIfNeeded: (...args: unknown[]) => mockEnqueueFollowUp(...args),
}));

vi.mock('@curvenote/scms-server', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('@curvenote/scms-server')>();
  return {
    ...actual,
    getPrismaClient: vi.fn(async () => ({
      job: { findUnique: mockFindUnique },
    })),
    jobs: {
      ...actual.jobs,
      dbUpdateJob: (...args: unknown[]) => mockDbUpdateJob(...args),
    },
  };
});

import {
  PROOFIG_PERSIST_PDF_FAILURE_CLEANUP,
  proofigPersistPdfFailureCleanupHandler,
} from './proofig-persist-pdf-failure-cleanup.server.js';

describe('proofigPersistPdfFailureCleanupHandler', () => {
  beforeEach(() => {
    mockPatchProofigRunServiceData.mockReset();
    mockEnqueueFollowUp.mockReset();
    mockDbUpdateJob.mockReset();
    mockFindUnique.mockReset();
    mockDbUpdateJob.mockImplementation(async (id, update) => ({ id, ...update }));
    mockPatchProofigRunServiceData.mockImplementation(async (_id, updater) => {
      updater({ stages: { initialPost: { status: 'completed', history: [], timestamp: '' } } });
    });
    mockEnqueueFollowUp.mockResolvedValue({ enqueued: false, reason: 'same-report-no-auto-retry' });
  });

  it('marks serviceData with the parent job error and completes', async () => {
    mockFindUnique.mockResolvedValueOnce({ depends_on_job_id: 'parent-1' }).mockResolvedValueOnce({
      id: 'parent-1',
      messages: ['Converter failed: page.goto: net::ERR_CONNECTION_REFUSED at http://x?token=abc'],
      payload: { report_id: 'report-1', check_service_run_id: 'run-1' },
    });

    await proofigPersistPdfFailureCleanupHandler({} as any, {
      id: 'cleanup-1',
      job_type: PROOFIG_PERSIST_PDF_FAILURE_CLEANUP,
      payload: { check_service_run_id: 'run-1', report_id: 'report-1' },
    });

    expect(mockPatchProofigRunServiceData).toHaveBeenCalledWith('run-1', expect.any(Function));
    const updater = mockPatchProofigRunServiceData.mock.calls[0][1] as (sd: any) => any;
    const marked = updater({
      stages: { initialPost: { status: 'completed', history: [], timestamp: '' } },
    });
    expect(marked.proofigReportPdfError).toContain('ERR_CONNECTION_REFUSED');
    expect(marked.proofigReportPdfError).not.toContain('token=abc');
    expect(marked.proofigReportPdfFailedReportId).toBe('report-1');

    expect(mockEnqueueFollowUp).toHaveBeenCalledWith('run-1', {
      excludeJobId: 'parent-1',
      jobReportId: 'report-1',
    });
    expect(mockDbUpdateJob).toHaveBeenCalledWith('cleanup-1', {
      status: JobStatus.COMPLETED,
      message: 'Proofig check run marked with report PDF generation error',
      results: { check_service_run_id: 'run-1', failed_job_id: 'parent-1' },
    });
  });
});
