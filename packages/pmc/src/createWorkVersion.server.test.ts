// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPMCWorkVersion, isPMCWorkMetadata } from './createWorkVersion.server.js';

const mockFindFirst = vi.fn();
const mockTransaction = vi.fn();
const mockDeleteMany = vi.fn();
const mockDbCreateDraftWorkVersion = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  dbCreateDraftWorkVersion: (...args: unknown[]) => mockDbCreateDraftWorkVersion(...args),
  getPrismaClient: async () => ({
    submission: { findFirst: mockFindFirst },
    $transaction: mockTransaction,
    workVersion: { deleteMany: mockDeleteMany },
  }),
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => 'submission-version-id',
}));

const ctx = {
  user: { id: 'user-1' },
} as never;

describe('isPMCWorkMetadata', () => {
  it('detects PMC metadata', () => {
    expect(isPMCWorkMetadata({ pmc: { title: 'Example' } })).toBe(true);
    expect(isPMCWorkMetadata({ checks: { enabled: [] } })).toBe(false);
    expect(isPMCWorkMetadata({ pmc: null })).toBe(false);
  });
});

describe('createPMCWorkVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteMany.mockResolvedValue({ count: 1 });
  });

  it('returns an error when no PMC submission exists for the work', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await createPMCWorkVersion(ctx, 'work-1', { pmc: { title: 'A' } }, 'Title');

    expect(result).toEqual({
      success: false,
      error: 'PMC submission not found for this work',
    });
    expect(mockDbCreateDraftWorkVersion).not.toHaveBeenCalled();
  });

  it('creates a draft work version and submission version on success', async () => {
    mockFindFirst.mockResolvedValue({ id: 'submission-1' });
    mockDbCreateDraftWorkVersion.mockResolvedValue({ workVersionId: 'work-version-1' });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        submissionVersion: { create: vi.fn().mockResolvedValue({}) },
        activity: { create: vi.fn().mockResolvedValue({}) },
      });
    });

    const result = await createPMCWorkVersion(
      ctx,
      'work-1',
      { pmc: { title: 'A', previewed: true, confirmed: true } },
      'Title',
    );

    expect(result).toEqual({
      success: true,
      workVersionId: 'work-version-1',
      redirectPath: '/app/works/work-1/site/pmc/deposit/submission-version-id',
    });
    expect(mockDbCreateDraftWorkVersion).toHaveBeenCalledWith(
      ctx,
      'work-1',
      'work-details',
      'Title',
      {
        pmc: {
          title: 'A',
          previewed: undefined,
          confirmed: undefined,
        },
      },
    );
  });

  it('cleans up the draft work version when the submission transaction fails', async () => {
    mockFindFirst.mockResolvedValue({ id: 'submission-1' });
    mockDbCreateDraftWorkVersion.mockResolvedValue({ workVersionId: 'work-version-1' });
    mockTransaction.mockRejectedValue(new Error('transaction failed'));

    const result = await createPMCWorkVersion(ctx, 'work-1', { pmc: {} }, 'Title');

    expect(result).toEqual({
      success: false,
      error: 'transaction failed',
    });
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'work-version-1', draft: true },
    });
  });
});
