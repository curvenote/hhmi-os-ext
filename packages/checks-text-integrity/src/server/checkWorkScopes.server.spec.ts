// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scopes } from '@curvenote/scms-core';

const scmsServerMocks = vi.hoisted(() => ({
  getPrismaClient: vi.fn(),
  dbGetUserWorkRoles: vi.fn(),
  userHasWorkScope: vi.fn(),
}));

vi.mock('@curvenote/scms-server', () => scmsServerMocks);

import {
  guardTextIntegrityWorkCheckScopes,
  TEXT_INTEGRITY_DISPATCH_INTENTS,
  rejectWorkChecksDispatch,
} from './checkWorkScopes.server.js';

const ctx = {
  user: { id: 'user-1' },
  $config: { app: {} },
} as Parameters<typeof guardTextIntegrityWorkCheckScopes>[0];

describe('guardTextIntegrityWorkCheckScopes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    scmsServerMocks.getPrismaClient.mockResolvedValue({
      workVersion: {
        findUnique: vi.fn(async () => ({ work_id: 'work-1' })),
      },
    });
    scmsServerMocks.dbGetUserWorkRoles.mockResolvedValue([]);
    scmsServerMocks.userHasWorkScope.mockReturnValue(false);
  });

  it('allows eula-status with checks.read only', async () => {
    scmsServerMocks.userHasWorkScope.mockImplementation(
      (_user, scope) => scope === scopes.work.id.checks.read,
    );

    const result = await guardTextIntegrityWorkCheckScopes(ctx, 'wv-1', 'eula-status');
    expect(result.ok).toBe(true);
    expect(TEXT_INTEGRITY_DISPATCH_INTENTS.has('eula-status')).toBe(false);
  });

  it('requires checks.dispatch for accept-eula', async () => {
    scmsServerMocks.userHasWorkScope.mockImplementation(
      (_user, scope) => scope === scopes.work.id.checks.read,
    );

    const result = await guardTextIntegrityWorkCheckScopes(ctx, 'wv-1', 'accept-eula');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result).toEqual(rejectWorkChecksDispatch());
    }
  });
});
