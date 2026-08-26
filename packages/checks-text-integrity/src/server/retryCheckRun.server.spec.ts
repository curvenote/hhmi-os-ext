// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { retryTextIntegrityCheckRun } from './retryCheckRun.server.js';
import { EULA_ADMIN_RETRY_SKIP_MESSAGE } from './eula.server.js';
import {
  markTextIntegritySourceRunSupersededByRetry,
  releaseTextIntegrityRunRetrySweepClaim,
  recordTextIntegritySweepMarkSupersededFailure,
  findExistingTextIntegrityRetrySuccessorId,
  TEXT_INTEGRITY_MAX_SWEEP_MARK_SUPERSEDED_FAILURES,
} from './runSuperseded.server.js';
import { markCheckServiceRunNoAutoRetry } from './checkRunColumns.server.js';

const mockFindFirst = vi.fn();
const mockStart = vi.fn();
const mockAssertSubmitter = vi.fn();
const mockAssertOriginal = vi.fn();
const mockGetEulaStatus = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    checkServiceRun: { findFirst: mockFindFirst },
  })),
  getConfig: vi.fn(async () => ({
    api: { submissionsServiceAccount: { id: 'service-account' } },
  })),
}));

vi.mock('./startCheckRun.server.js', () => ({
  startTextIntegrityCheckRun: (...args: unknown[]) => mockStart(...args),
}));

vi.mock('./runSuperseded.server.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    isTextIntegrityRunSupersededByRetry: vi.fn(() => false),
    markTextIntegritySourceRunSupersededByRetry: vi.fn(async () => {}),
    releaseTextIntegrityRunRetrySweepClaim: vi.fn(async () => {}),
    findExistingTextIntegrityRetrySuccessorId: vi.fn(async () => null),
    recordTextIntegritySweepMarkSupersededFailure: vi.fn(async () => 1),
  };
});

vi.mock('./checkRunColumns.server.js', () => ({
  markCheckServiceRunNoAutoRetry: vi.fn(async () => {}),
}));

vi.mock('./eula.server.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    assertSubmitterEulaAccepted: (...args: unknown[]) => mockAssertSubmitter(...args),
    assertOriginalSubmitterEulaCurrent: (...args: unknown[]) => mockAssertOriginal(...args),
    getEulaStatusForUser: (...args: unknown[]) => mockGetEulaStatus(...args),
  };
});

const mockMarkSuperseded = vi.mocked(markTextIntegritySourceRunSupersededByRetry);
const mockReleaseClaim = vi.mocked(releaseTextIntegrityRunRetrySweepClaim);
const mockRecordMarkFailure = vi.mocked(recordTextIntegritySweepMarkSupersededFailure);
const mockFindSuccessor = vi.mocked(findExistingTextIntegrityRetrySuccessorId);
const mockMarkNoAutoRetry = vi.mocked(markCheckServiceRunNoAutoRetry);

const ctx = {
  user: { id: 'admin-user' },
  $config: { app: { extensions: {} } },
} as any;

const failedRun = {
  id: 'run-1',
  kind: 'checks-text-integrity',
  work_version_id: 'wv-1',
  created_by_id: 'original-user',
  status: 'error',
  attempt: 1,
  data: {},
};

describe('retryTextIntegrityCheckRun', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockStart.mockReset();
    mockAssertSubmitter.mockReset();
    mockAssertOriginal.mockReset();
    mockGetEulaStatus.mockReset();
    mockFindFirst.mockResolvedValue(failedRun);
    mockStart.mockResolvedValue({ ok: true, checkRunId: 'run-2' });
    mockAssertSubmitter.mockResolvedValue(null);
    mockAssertOriginal.mockResolvedValue({ ok: true });
    mockMarkSuperseded.mockReset();
    mockMarkSuperseded.mockResolvedValue(undefined);
    mockReleaseClaim.mockReset();
    mockReleaseClaim.mockResolvedValue(undefined);
    mockRecordMarkFailure.mockReset();
    mockRecordMarkFailure.mockResolvedValue(1);
    mockFindSuccessor.mockReset();
    mockFindSuccessor.mockResolvedValue(null);
    mockMarkNoAutoRetry.mockReset();
    mockMarkNoAutoRetry.mockResolvedValue(undefined);
  });

  it('blocks user retry when EULA is not accepted', async () => {
    mockAssertSubmitter.mockResolvedValue('Accept the EULA first');
    mockGetEulaStatus.mockResolvedValue({ requireEula: true, eula: { version: '1' } });

    const result = await retryTextIntegrityCheckRun(ctx, 'wv-1', 'run-1', 'user');
    expect(result.status).toBe(400);
    expect(result.error?.message).toContain('EULA');
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('skips admin retry when original submitter EULA is stale', async () => {
    mockAssertOriginal.mockResolvedValue({ ok: false, message: EULA_ADMIN_RETRY_SKIP_MESSAGE });

    const result = await retryTextIntegrityCheckRun(ctx, 'wv-1', 'run-1', 'admin');
    expect(result.status).toBe(400);
    expect((result as { eulaSkip?: boolean }).eulaSkip).toBe(true);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('admin retry preserves original submitter when EULA is current', async () => {
    await retryTextIntegrityCheckRun(ctx, 'wv-1', 'run-1', 'admin');
    expect(mockStart).toHaveBeenCalledWith(
      ctx,
      'wv-1',
      expect.objectContaining({
        createdById: 'original-user',
        invokedById: 'service-account',
        lineage: expect.objectContaining({ retryOfRunId: 'run-1', sourceAttempt: 2 }),
      }),
    );
  });

  it('returns markSupersededFailed when marking the source superseded fails', async () => {
    mockMarkSuperseded.mockRejectedValue(new Error('OCC exhausted'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await retryTextIntegrityCheckRun(ctx, 'wv-1', 'run-1', 'admin');
    expect(result).toMatchObject({
      status: 500,
      markSupersededFailed: true,
      checkRunId: 'run-2',
    });
    expect(mockMarkSuperseded).toHaveBeenCalledWith('run-1', 'run-2', 'admin-user');
    expect(mockRecordMarkFailure).toHaveBeenCalledWith('run-1');
    expect(mockReleaseClaim).toHaveBeenCalledWith('run-1');
    expect(mockMarkNoAutoRetry).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('swallows release claim failure after mark-superseded failure', async () => {
    mockMarkSuperseded.mockRejectedValue(new Error('OCC exhausted'));
    mockReleaseClaim.mockRejectedValue(new Error('release failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await retryTextIntegrityCheckRun(ctx, 'wv-1', 'run-1', 'admin');
    expect(result).toMatchObject({ markSupersededFailed: true, checkRunId: 'run-2' });
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('marks no_auto_retry after repeated mark-superseded failures', async () => {
    mockMarkSuperseded.mockRejectedValue(new Error('OCC exhausted'));
    mockRecordMarkFailure.mockResolvedValue(TEXT_INTEGRITY_MAX_SWEEP_MARK_SUPERSEDED_FAILURES);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await retryTextIntegrityCheckRun(ctx, 'wv-1', 'run-1', 'admin');
    expect(mockMarkNoAutoRetry).toHaveBeenCalledWith('run-1');

    errorSpy.mockRestore();
  });

  it('reuses an existing retry successor instead of creating a duplicate run', async () => {
    mockFindSuccessor.mockResolvedValue('run-existing');

    await retryTextIntegrityCheckRun(ctx, 'wv-1', 'run-1', 'admin');
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockMarkSuperseded).toHaveBeenCalledWith('run-1', 'run-existing', 'admin-user');
  });
});
