// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clonePMCVersion } from './clone.server.js';
import { seedPMCDraftMetadataFromSource } from '../../seedPMCDraftMetadata.server.js';

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockTransaction = vi.fn();
const mockDeleteMany = vi.fn();
const mockCloneDraftWorkVersionFromSource = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  cloneDraftWorkVersionFromSource: (...args: unknown[]) =>
    mockCloneDraftWorkVersionFromSource(...args),
  getPrismaClient: async () => ({
    submissionVersion: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
    },
    workVersion: { deleteMany: mockDeleteMany },
    $transaction: mockTransaction,
  }),
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => 'new-submission-version-id',
}));

const ctx = {
  user: { id: 'user-1' },
} as never;

const referenceSubmissionVersion = {
  id: 'sv-ref',
  submission_id: 'submission-1',
  work_version_id: 'wv-source',
  date_published: null,
  work_version: {
    work_id: 'work-1',
  },
};

describe('clonePMCVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(referenceSubmissionVersion);
    mockFindFirst.mockResolvedValue(null);
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockCloneDraftWorkVersionFromSource.mockResolvedValue({ workVersionId: 'wv-cloned' });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const activityCreate = vi.fn().mockResolvedValue({});
      const submissionVersionCreate = vi.fn().mockResolvedValue({
        id: 'new-submission-version-id',
        submission_id: 'submission-1',
      });
      return fn({
        submissionVersion: { create: submissionVersionCreate },
        activity: { create: activityCreate },
      });
    });
  });

  it('clones via platform helper and creates only submission-version activity', async () => {
    let activityCreate: ReturnType<typeof vi.fn> | undefined;
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      activityCreate = vi.fn().mockResolvedValue({});
      return fn({
        submissionVersion: {
          create: vi.fn().mockResolvedValue({
            id: 'new-submission-version-id',
            submission_id: 'submission-1',
          }),
        },
        activity: { create: activityCreate },
      });
    });

    const result = await clonePMCVersion(ctx, 'sv-ref');

    expect(result).toEqual({
      newWorkVersionId: 'wv-cloned',
      newSubmissionVersionId: 'new-submission-version-id',
    });
    expect(mockCloneDraftWorkVersionFromSource).toHaveBeenCalledWith(ctx, {
      workId: 'work-1',
      sourceWorkVersionId: 'wv-source',
      source: 'pmc-submission-clone',
      activityType: 'WORK_VERSION_ADDED',
      seedMetadataFromSource: seedPMCDraftMetadataFromSource,
    });
    expect(activityCreate).toHaveBeenCalledTimes(1);
    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activity_type: 'SUBMISSION_VERSION_ADDED',
          submission_version_id: 'new-submission-version-id',
        }),
      }),
    );
  });

  it('rejects when user is not authenticated', async () => {
    await expect(clonePMCVersion({ user: undefined } as never, 'sv-ref')).rejects.toThrow(
      'User must be authenticated to clone versions',
    );
  });

  it('rejects when submission version is missing', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(clonePMCVersion(ctx, 'missing')).rejects.toThrow(
      'Submission version missing not found',
    );
  });

  it('rejects when a draft submission version already exists', async () => {
    mockFindFirst.mockResolvedValue({ id: 'sv-draft' });

    await expect(clonePMCVersion(ctx, 'sv-ref')).rejects.toThrow(
      'A version is already being cloned for this work',
    );
    expect(mockCloneDraftWorkVersionFromSource).not.toHaveBeenCalled();
  });

  it('cleans up the draft work version when the submission transaction fails', async () => {
    mockTransaction.mockRejectedValue(new Error('transaction failed'));

    await expect(clonePMCVersion(ctx, 'sv-ref')).rejects.toThrow('transaction failed');
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'wv-cloned', draft: true },
    });
  });
});
