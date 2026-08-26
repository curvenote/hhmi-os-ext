// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnownState, MINIMAL_PROOFIG_SERVICE_DATA } from '../schema.js';

const mockFindFirst = vi.fn();
const mockEnqueue = vi.fn();
const mockTrackChecksEvent = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    checkServiceRun: { findFirst: mockFindFirst },
  })),
}));

vi.mock('./enqueue-proofig-persist-pdf.server.js', () => ({
  enqueueProofigPersistPdfIfNeeded: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock('@hhmi/checks-shared/analytics/server', () => ({
  trackChecksEvent: (...args: unknown[]) => mockTrackChecksEvent(...args),
}));

import { handleRegenerateProofigPdfAction } from './regenerateProofigPdf.server.js';
import { ImageIntegrityTrackEvent } from '../analytics.catalog.js';

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

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const ctx = {
  user: { id: 'user-1' },
} as any;

describe('handleRegenerateProofigPdfAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrackChecksEvent.mockResolvedValue(undefined);
  });

  it('rejects when ctx is missing', async () => {
    const result = await handleRegenerateProofigPdfAction({
      ctx: undefined,
      workVersionId: 'wv-1',
      formData: formData({ checkRunId: 'run-1' }),
    });
    expect(result.status).toBe(401);
    expect(result.error?.message).toMatch(/signed-in/i);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('rejects when workVersionId is missing', async () => {
    const result = await handleRegenerateProofigPdfAction({
      ctx,
      workVersionId: undefined,
      formData: formData({ checkRunId: 'run-1' }),
    });
    expect(result.status).toBe(400);
    expect(result.error?.message).toMatch(/Work version ID/i);
  });

  it('rejects when checkRunId is missing', async () => {
    const result = await handleRegenerateProofigPdfAction({
      ctx,
      workVersionId: 'wv-1',
      formData: formData({}),
    });
    expect(result.status).toBe(400);
    expect(result.error?.message).toMatch(/checkRunId/i);
  });

  it('rejects when the check run is not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await handleRegenerateProofigPdfAction({
      ctx,
      workVersionId: 'wv-1',
      formData: formData({ checkRunId: 'run-missing' }),
    });
    expect(result.status).toBe(404);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('rejects when the run is not at a final report stage', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'run-1',
      data: { serviceData: { ...MINIMAL_PROOFIG_SERVICE_DATA } },
    });
    const result = await handleRegenerateProofigPdfAction({
      ctx,
      workVersionId: 'wv-1',
      formData: formData({ checkRunId: 'run-1' }),
    });
    expect(result.status).toBe(400);
    expect(result.error?.message).toMatch(/final report/i);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('rejects when no report URL is stored', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'run-1',
      data: {
        serviceData: finalReportServiceData({
          reportUrl: undefined,
          summary: {
            state: KnownState.ReportClean,
            receivedAt: '2025-01-01T00:00:00Z',
          },
        }),
      },
    });
    const result = await handleRegenerateProofigPdfAction({
      ctx,
      workVersionId: 'wv-1',
      formData: formData({ checkRunId: 'run-1' }),
    });
    expect(result.status).toBe(400);
    expect(result.error?.message).toMatch(/No report URL/i);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('force-enqueues persist and returns success', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'run-1',
      data: { serviceData: finalReportServiceData() },
    });
    mockEnqueue.mockResolvedValue({ enqueued: true, jobId: 'job-1' });

    const result = await handleRegenerateProofigPdfAction({
      ctx,
      workVersionId: 'wv-1',
      formData: formData({ checkRunId: 'run-1' }),
    });

    expect(result).toEqual({ success: true });
    expect(mockEnqueue).toHaveBeenCalledWith('run-1', {
      force: true,
      invokedById: 'user-1',
    });
    expect(mockTrackChecksEvent).toHaveBeenCalledWith(
      ctx,
      ImageIntegrityTrackEvent.CHECKS_PDF_REGENERATION_REQUESTED,
      expect.objectContaining({
        checkKind: 'proofig',
        workVersionId: 'wv-1',
        checkRunId: 'run-1',
      }),
    );
  });

  it('returns enqueue failure reason', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'run-1',
      data: { serviceData: finalReportServiceData() },
    });
    mockEnqueue.mockResolvedValue({ enqueued: false, reason: 'run-not-found' });

    const result = await handleRegenerateProofigPdfAction({
      ctx,
      workVersionId: 'wv-1',
      formData: formData({ checkRunId: 'run-1' }),
    });

    expect(result.status).toBe(400);
    expect(result.error?.message).toContain('run-not-found');
    expect(mockTrackChecksEvent).not.toHaveBeenCalled();
  });

  it('treats already-in-flight as benign success', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'run-1',
      data: { serviceData: finalReportServiceData() },
    });
    mockEnqueue.mockResolvedValue({ enqueued: false, reason: 'already-in-flight' });

    const result = await handleRegenerateProofigPdfAction({
      ctx,
      workVersionId: 'wv-1',
      formData: formData({ checkRunId: 'run-1' }),
    });

    expect(result).toEqual({ success: true });
    expect(mockTrackChecksEvent).not.toHaveBeenCalled();
  });

  it('logs and contains fire-and-forget analytics rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFindFirst.mockResolvedValue({
      id: 'run-1',
      data: { serviceData: finalReportServiceData() },
    });
    mockEnqueue.mockResolvedValue({ enqueued: true, jobId: 'job-1' });
    mockTrackChecksEvent.mockRejectedValue(new Error('analytics unavailable'));

    const result = await handleRegenerateProofigPdfAction({
      ctx,
      workVersionId: 'wv-1',
      formData: formData({ checkRunId: 'run-1' }),
    });

    expect(result).toEqual({ success: true });
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        '[proofig] PDF regeneration analytics failed',
        expect.objectContaining({ checkRunId: 'run-1', err: expect.any(Error) }),
      );
    });
    consoleError.mockRestore();
  });
});
