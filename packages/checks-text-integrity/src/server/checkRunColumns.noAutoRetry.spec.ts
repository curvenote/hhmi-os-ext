// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { markCheckServiceRunNoAutoRetry } from './checkRunColumns.server.js';

const mockUpdateMany = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    checkServiceRun: { updateMany: mockUpdateMany },
  })),
}));

describe('markCheckServiceRunNoAutoRetry', () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('sets no_auto_retry only when not already opted out', async () => {
    await markCheckServiceRunNoAutoRetry('run-1');
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', no_auto_retry: false },
      data: expect.objectContaining({ no_auto_retry: true }),
    });
  });
});
