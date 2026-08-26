// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { JobStatus } from '@curvenote/scms-db';

const mockApplyDocumentPreparationFromConverterJob = vi.fn();
const mockDbUpdateJob = vi.fn();

vi.mock('../applyDocumentPreparationFromConverterJob.server.js', () => ({
  applyDocumentPreparationFromConverterJob: (...args: unknown[]) =>
    mockApplyDocumentPreparationFromConverterJob(...args),
}));

vi.mock('@curvenote/scms-server', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('@curvenote/scms-server')>();
  return {
    ...actual,
    jobs: {
      ...actual.jobs,
      dbUpdateJob: (...args: unknown[]) => mockDbUpdateJob(...args),
    },
  };
});

import {
  PROOFIG_CONVERTER_FAILURE_CLEANUP,
  proofigConverterFailureCleanupHandler,
} from './proofig-converter-failure-cleanup.server.js';

describe('proofigConverterFailureCleanupHandler', () => {
  beforeEach(() => {
    mockApplyDocumentPreparationFromConverterJob.mockReset();
    mockDbUpdateJob.mockReset();
    mockDbUpdateJob.mockImplementation(async (id, update) => ({ id, ...update }));
  });

  it('marks the job COMPLETED when the check run is updated', async () => {
    mockApplyDocumentPreparationFromConverterJob.mockResolvedValue({ ok: true, updated: true });

    await proofigConverterFailureCleanupHandler({} as any, {
      id: 'cleanup-job-1',
      job_type: PROOFIG_CONVERTER_FAILURE_CLEANUP,
      payload: { proofig_run_id: 'run-1' },
    });

    expect(mockApplyDocumentPreparationFromConverterJob).toHaveBeenCalledWith('run-1');
    expect(mockDbUpdateJob).toHaveBeenCalledWith('cleanup-job-1', {
      status: JobStatus.COMPLETED,
      message: 'Proofig check run marked error after converter failure',
      results: { updated: true },
    });
  });

  it('marks the job COMPLETED when the check run is already terminal', async () => {
    mockApplyDocumentPreparationFromConverterJob.mockResolvedValue({ ok: true, updated: false });

    await proofigConverterFailureCleanupHandler({} as any, {
      id: 'cleanup-job-2',
      job_type: PROOFIG_CONVERTER_FAILURE_CLEANUP,
      payload: { proofig_run_id: 'run-2' },
    });

    expect(mockApplyDocumentPreparationFromConverterJob).toHaveBeenCalledWith('run-2');
    expect(mockDbUpdateJob).toHaveBeenCalledWith('cleanup-job-2', {
      status: JobStatus.COMPLETED,
      message: 'Proofig check run already terminal after converter failure',
      results: { updated: false },
    });
  });

  it('marks the job FAILED when the check run is not found', async () => {
    mockApplyDocumentPreparationFromConverterJob.mockResolvedValue({
      ok: false,
      message: 'Proofig check run not found.',
    });

    await proofigConverterFailureCleanupHandler({} as any, {
      id: 'cleanup-job-3',
      job_type: PROOFIG_CONVERTER_FAILURE_CLEANUP,
      payload: { proofig_run_id: 'run-missing' },
    });

    expect(mockDbUpdateJob).toHaveBeenCalledWith('cleanup-job-3', {
      status: JobStatus.FAILED,
      message: 'Proofig check run not found.',
    });
  });
});
