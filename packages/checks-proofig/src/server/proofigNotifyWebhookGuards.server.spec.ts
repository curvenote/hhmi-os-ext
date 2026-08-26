// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi } from 'vitest';
import { KnownState } from '../schema.js';
import { proofigCheckRunAlreadyMarkedDeleted } from './proofigNotifyWebhookGuards.server.js';

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(),
}));

import { getPrismaClient } from '@curvenote/scms-server';

describe('proofigCheckRunAlreadyMarkedDeleted', () => {
  it('returns false when row is missing', async () => {
    vi.mocked(getPrismaClient).mockResolvedValue({
      checkServiceRun: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any);
    expect(await proofigCheckRunAlreadyMarkedDeleted('missing-id')).toBe(false);
  });

  it('returns false when kind is not proofig', async () => {
    vi.mocked(getPrismaClient).mockResolvedValue({
      checkServiceRun: {
        findUnique: vi.fn().mockResolvedValue({
          kind: 'other',
          data: { serviceData: { deleted: true, stages: { initialPost: {} } } },
        }),
      },
    } as any);
    expect(await proofigCheckRunAlreadyMarkedDeleted('id-1')).toBe(false);
  });

  it('returns true when serviceData.deleted is true', async () => {
    vi.mocked(getPrismaClient).mockResolvedValue({
      checkServiceRun: {
        findUnique: vi.fn().mockResolvedValue({
          kind: 'proofig',
          data: {
            serviceData: {
              deleted: true,
              stages: {
                initialPost: { status: 'completed', history: [], timestamp: 't' },
              },
            },
          },
        }),
      },
    } as any);
    expect(await proofigCheckRunAlreadyMarkedDeleted('id-1')).toBe(true);
  });

  it('returns true when summary.state is Deleted (legacy shape)', async () => {
    vi.mocked(getPrismaClient).mockResolvedValue({
      checkServiceRun: {
        findUnique: vi.fn().mockResolvedValue({
          kind: 'proofig',
          data: {
            serviceData: {
              summary: {
                state: KnownState.Deleted,
                receivedAt: 't',
              },
              stages: {
                initialPost: { status: 'completed', history: [], timestamp: 't' },
              },
            },
          },
        }),
      },
    } as any);
    expect(await proofigCheckRunAlreadyMarkedDeleted('id-1')).toBe(true);
  });

  it('returns false when serviceData is invalid', async () => {
    vi.mocked(getPrismaClient).mockResolvedValue({
      checkServiceRun: {
        findUnique: vi.fn().mockResolvedValue({
          kind: 'proofig',
          data: { serviceData: 'not-an-object' },
        }),
      },
    } as any);
    expect(await proofigCheckRunAlreadyMarkedDeleted('id-1')).toBe(false);
  });
});
