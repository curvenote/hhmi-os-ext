// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveResumeDraftPath } from './resolveResumeDraftPath.server.js';

const mockFindFirst = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: async () => ({
    submissionVersion: { findFirst: mockFindFirst },
  }),
}));

const ctx = {} as never;

describe('resolveResumeDraftPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the PMC deposit path when a draft submission version exists', async () => {
    mockFindFirst.mockResolvedValue({ id: 'sv-1' });

    await expect(
      resolveResumeDraftPath({
        ctx,
        workId: 'work-1',
        workVersionId: 'wv-1',
        metadata: { pmc: {} },
      }),
    ).resolves.toBe('/app/works/work-1/site/pmc/deposit/sv-1');

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        work_version_id: 'wv-1',
        submission: { site: { name: 'pmc' } },
        status: 'DRAFT',
      },
      orderBy: { date_created: 'desc' },
      select: { id: true },
    });
  });

  it('returns null when no draft submission version exists', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      resolveResumeDraftPath({
        ctx,
        workId: 'work-1',
        workVersionId: 'wv-1',
        metadata: { pmc: {} },
      }),
    ).resolves.toBeNull();
  });
});
