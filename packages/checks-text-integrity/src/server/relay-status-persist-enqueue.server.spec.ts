// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MINIMAL_TEXT_INTEGRITY_SERVICE_DATA, type TextIntegrityDataSchema } from '../schema.js';

const mockFindUnique = vi.fn();
const mockEnqueue = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    checkServiceRun: { findUnique: mockFindUnique },
  })),
}));

vi.mock('./enqueue-persist-pdf.server.js', () => ({
  enqueueTextIntegrityPersistPdfJob: (...args: unknown[]) => mockEnqueue(...args),
}));

import { enqueuePersistPdfAfterRelayStatusIfNeeded } from './relay-status-persist-enqueue.server.js';

function runWithServiceData(serviceData: TextIntegrityDataSchema) {
  return {
    work_version_id: 'wv-1',
    created_by_id: 'user-1',
    data: { serviceData },
  };
}

describe('enqueuePersistPdfAfterRelayStatusIfNeeded', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockEnqueue.mockReset();
    mockEnqueue.mockResolvedValue(undefined);
  });

  it('enqueues when reportPdfId exists and PDF is not stored', async () => {
    mockFindUnique.mockResolvedValue(
      runWithServiceData({
        ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
        stages: {
          ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages,
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
        reportPdfId: 'pdf-1',
      }),
    );

    await expect(enqueuePersistPdfAfterRelayStatusIfNeeded('run-1', 'actor-1')).resolves.toEqual({
      enqueued: true,
    });
    expect(mockEnqueue).toHaveBeenCalledWith('wv-1', 'run-1', 'actor-1');
  });

  it('enqueues when reportPdfId differs from storedReportPdfId', async () => {
    mockFindUnique.mockResolvedValue(
      runWithServiceData({
        ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
        stages: {
          ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages,
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
        reportPdfId: 'pdf-2',
        similarityReportStored: true,
        storedReportPdfId: 'pdf-1',
      }),
    );

    await expect(enqueuePersistPdfAfterRelayStatusIfNeeded('run-1')).resolves.toEqual({
      enqueued: true,
    });
    expect(mockEnqueue).toHaveBeenCalledWith('wv-1', 'run-1', 'user-1');
  });

  it('does not enqueue while report generation is still processing', async () => {
    mockFindUnique.mockResolvedValue(
      runWithServiceData({
        ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
        stages: {
          ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages,
          reportGeneration: {
            status: 'processing',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
        reportPdfId: 'pdf-1',
      }),
    );

    await expect(enqueuePersistPdfAfterRelayStatusIfNeeded('run-1')).resolves.toEqual({
      enqueued: false,
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when the current PDF id is already stored', async () => {
    mockFindUnique.mockResolvedValue(
      runWithServiceData({
        ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
        stages: {
          ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA.stages,
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
        reportPdfId: 'pdf-1',
        similarityReportStored: true,
        storedReportPdfId: 'pdf-1',
      }),
    );

    await expect(enqueuePersistPdfAfterRelayStatusIfNeeded('run-1')).resolves.toEqual({
      enqueued: false,
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when there is no reportPdfId', async () => {
    mockFindUnique.mockResolvedValue(runWithServiceData(MINIMAL_TEXT_INTEGRITY_SERVICE_DATA));

    await expect(enqueuePersistPdfAfterRelayStatusIfNeeded('run-1')).resolves.toEqual({
      enqueued: false,
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when the check run is missing', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(enqueuePersistPdfAfterRelayStatusIfNeeded('run-1')).resolves.toEqual({
      enqueued: false,
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('swallows DB errors and returns enqueued: false so Refresh is not failed', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFindUnique.mockRejectedValue(new Error('pool exhausted'));

    await expect(enqueuePersistPdfAfterRelayStatusIfNeeded('run-1')).resolves.toEqual({
      enqueued: false,
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
