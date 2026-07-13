import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionSubmitToSiteArgs } from '@curvenote/scms-core';

const mockFindFirstWorkVersion = vi.fn();
const mockFindFirstSubmission = vi.fn();
const mockFindFirstSubmissionVersion = vi.fn();
const mockSubmissionVersionCreate = vi.fn();
const mockSubmissionCreate = vi.fn();
const mockActivityCreate = vi.fn();
const mockSiteFindUnique = vi.fn();
const mockTransaction = vi.fn();
const mockSafeWorkVersionJsonUpdate = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    site: { findUnique: mockSiteFindUnique },
    workVersion: { findFirst: mockFindFirstWorkVersion },
    submission: { findFirst: mockFindFirstSubmission },
    submissionVersion: { findFirst: mockFindFirstSubmissionVersion },
    $transaction: mockTransaction,
  })),
  makeDefaultWorkVersionMetadata: vi.fn(() => ({})),
  safeWorkVersionJsonUpdate: (...args: unknown[]) => mockSafeWorkVersionJsonUpdate(...args),
}));

vi.mock('uuidv7', () => ({
  uuidv7: vi
    .fn()
    .mockReturnValueOnce('submission-id')
    .mockReturnValueOnce('submission-version-id')
    .mockReturnValueOnce('activity-id')
    .mockReturnValue('uuid'),
}));

const { submitWorkToPmcSite } = await import('./submitToSite.server.js');

describe('submitWorkToPmcSite', () => {
  const ctx = {
    user: { id: 'user-1', display_name: 'Jane Doe', email: 'jane@example.com' },
    work: { id: 'work-1' },
  } as unknown as ExtensionSubmitToSiteArgs['ctx'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirstWorkVersion.mockResolvedValue({ id: 'wv-final' });
    mockFindFirstSubmissionVersion.mockResolvedValue(null);
    mockSafeWorkVersionJsonUpdate.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        site: { findUnique: mockSiteFindUnique },
        submission: { create: mockSubmissionCreate },
        submissionVersion: { create: mockSubmissionVersionCreate },
        activity: { create: mockActivityCreate },
      }),
    );
    mockSiteFindUnique.mockResolvedValue({
      id: 'site-pmc',
      submissionKinds: [{ id: 'kind-1' }],
      collections: [{ id: 'collection-1' }],
    });
    mockSubmissionCreate.mockResolvedValue({ id: 'submission-id' });
    mockSubmissionVersionCreate.mockResolvedValue({ id: 'submission-version-id' });
    mockActivityCreate.mockResolvedValue({ id: 'activity-id' });
  });

  it('resumes an existing draft submission version and syncs manuscript mappings without resetting progress', async () => {
    mockFindFirstSubmissionVersion.mockResolvedValue({ id: 'sv-draft' });

    const result = await submitWorkToPmcSite({
      ctx,
      workId: 'work-1',
      workVersionId: 'wv-final',
      siteName: 'pmc',
    });

    expect(result).toEqual({
      success: true,
      submissionVersionId: 'sv-draft',
      redirectPath: '/app/works/work-1/site/pmc/deposit/sv-draft',
    });
    expect(mockFindFirstSubmissionVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          submission: { work_id: 'work-1', site_id: 'site-pmc' },
          status: 'DRAFT',
        },
      }),
    );
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockSafeWorkVersionJsonUpdate).toHaveBeenCalledWith('wv-final', expect.any(Function));

    const updater = mockSafeWorkVersionJsonUpdate.mock.calls[0][1] as (metadata: object) => {
      pmc?: { previewed?: boolean; confirmed?: boolean };
    };
    const updated = updater({
      pmc: { previewed: true, confirmed: true },
      files: {},
    });
    expect(updated.pmc).toMatchObject({ previewed: true, confirmed: true });
  });

  it('creates a submission version on the current work version when no draft exists', async () => {
    mockFindFirstSubmission.mockResolvedValue({ id: 'submission-1' });

    const result = await submitWorkToPmcSite({
      ctx,
      workId: 'work-1',
      workVersionId: 'wv-final',
      siteName: 'pmc',
    });

    expect(result.success).toBe(true);
    expect(result.redirectPath).toBe('/app/works/work-1/site/pmc/deposit/submission-id');
    expect(mockFindFirstSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { work_id: 'work-1', site_id: 'site-pmc' },
      }),
    );
    expect(mockSubmissionVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          work_version_id: 'wv-final',
          status: 'DRAFT',
        }),
      }),
    );
    expect(mockSubmissionCreate).not.toHaveBeenCalled();
    expect(mockSafeWorkVersionJsonUpdate).toHaveBeenCalledWith('wv-final', expect.any(Function));
  });

  it('creates a new PMC submission when the work has none yet', async () => {
    mockFindFirstSubmission.mockResolvedValue(null);

    const result = await submitWorkToPmcSite({
      ctx,
      workId: 'work-1',
      workVersionId: 'wv-final',
      siteName: 'pmc',
    });

    expect(result.success).toBe(true);
    expect(mockSubmissionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          work_id: 'work-1',
          site_id: 'site-pmc',
          versions: expect.objectContaining({
            create: expect.objectContaining({
              work_version_id: 'wv-final',
              status: 'DRAFT',
            }),
          }),
        }),
      }),
    );
  });

  it('rejects submit when the selected site does not exist', async () => {
    mockSiteFindUnique.mockResolvedValueOnce(null);

    const result = await submitWorkToPmcSite({
      ctx,
      workId: 'work-1',
      workVersionId: 'wv-final',
      siteName: 'pmc',
    });

    expect(result).toEqual({
      success: false,
      error: 'Selected site does not exist',
    });
    expect(mockFindFirstSubmissionVersion).not.toHaveBeenCalled();
  });
});
