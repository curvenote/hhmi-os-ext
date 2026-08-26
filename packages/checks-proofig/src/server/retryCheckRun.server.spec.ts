// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { retryProofigCheckRun } from './retryCheckRun.server.js';
import { markProofigSourceRunSupersededByRetry } from './runSuperseded.server.js';

const mockFindFirst = vi.fn();
const mockStart = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    checkServiceRun: { findFirst: mockFindFirst },
  })),
  getConfig: vi.fn(async () => ({
    api: { submissionsServiceAccount: { id: 'service-account' } },
  })),
}));

vi.mock('./startCheckRun.server.js', () => ({
  startProofigCheckRun: (...args: unknown[]) => mockStart(...args),
}));

vi.mock('./runSuperseded.server.js', () => ({
  isProofigRunSupersededByRetry: vi.fn(() => false),
  markProofigSourceRunSupersededByRetry: vi.fn(async () => {}),
}));

const mockMarkSuperseded = vi.mocked(markProofigSourceRunSupersededByRetry);

const ctx = {
  user: { id: 'admin-user' },
  $config: { app: { extensions: {} } },
} as any;

describe('retryProofigCheckRun', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockStart.mockReset();
    mockMarkSuperseded.mockReset();
    mockMarkSuperseded.mockResolvedValue(undefined);
  });

  it('rejects when source run is not failed', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: 'wv-1',
      created_by_id: 'user-1',
      status: 'healthy',
      data: { serviceData: { stages: {} } },
    });

    const result = await retryProofigCheckRun(ctx, 'wv-1', 'run-1', 'user');
    expect(result.status).toBe(400);
    expect(result.error?.message).toContain('Only failed');
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('user retry uses invoking user as submitter', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: 'wv-1',
      created_by_id: 'original-user',
      status: 'error',
      attempt: 1,
      data: {},
    });
    mockStart.mockResolvedValue({ ok: true, checkRunId: 'run-2' });

    const result = await retryProofigCheckRun(ctx, 'wv-1', 'run-1', 'user');
    expect(result).toMatchObject({ success: true, checkRunId: 'run-2' });
    expect(mockStart).toHaveBeenCalledWith(
      ctx,
      'wv-1',
      expect.objectContaining({
        createdById: 'admin-user',
        invokedById: 'service-account',
        lineage: expect.objectContaining({ retryOfRunId: 'run-1', sourceAttempt: 2 }),
      }),
    );
  });

  it('admin retry preserves original submitter', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: 'wv-1',
      created_by_id: 'original-user',
      status: 'error',
      attempt: 1,
      data: {},
    });
    mockStart.mockResolvedValue({ ok: true, checkRunId: 'run-2' });

    await retryProofigCheckRun(ctx, 'wv-1', 'run-1', 'admin');
    expect(mockStart).toHaveBeenCalledWith(
      ctx,
      'wv-1',
      expect.objectContaining({
        createdById: 'original-user',
        invokedById: 'service-account',
      }),
    );
  });

  it('still succeeds when marking the source superseded fails', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'run-1',
      kind: 'proofig',
      work_version_id: 'wv-1',
      created_by_id: 'original-user',
      status: 'error',
      attempt: 1,
      data: {},
    });
    mockStart.mockResolvedValue({ ok: true, checkRunId: 'run-2' });
    mockMarkSuperseded.mockRejectedValue(new Error('OCC exhausted'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await retryProofigCheckRun(ctx, 'wv-1', 'run-1', 'admin');
    expect(result).toMatchObject({ success: true, checkRunId: 'run-2' });
    expect(mockMarkSuperseded).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
