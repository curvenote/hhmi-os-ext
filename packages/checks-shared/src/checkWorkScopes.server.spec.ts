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
  assertWorkChecksRead,
  assertWorkChecksReadForRun,
  createWorkCheckScopeGuard,
  rejectAuthenticationRequired,
  rejectWorkChecksDispatch,
  rejectWorkChecksRead,
} from './checkWorkScopes.server.js';
import type { Context } from '@curvenote/scms-core';

const DISPATCH_INTENTS = new Set(['execute', 'retry']);

const guardWorkCheckScopes = createWorkCheckScopeGuard(DISPATCH_INTENTS);

const ctx = {
  user: { id: 'user-1' },
  $config: { app: {} },
} as Context;

describe('createWorkCheckScopeGuard', () => {
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

  it('rejects unauthenticated requests', async () => {
    const result = await guardWorkCheckScopes(undefined, 'wv-1', 'execute');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result).toEqual(rejectAuthenticationRequired());
    }
  });

  it('rejects signed-out context without a user', async () => {
    const signedOutCtx = { ...ctx, user: undefined } as Context;
    const result = await guardWorkCheckScopes(signedOutCtx, 'wv-1', 'execute');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result).toEqual(rejectAuthenticationRequired());
    }
  });

  it('requires workVersionId', async () => {
    const result = await guardWorkCheckScopes(ctx, undefined, 'execute');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result.status).toBe(400);
    }
  });

  it('requires checks.dispatch for outbound intents', async () => {
    scmsServerMocks.userHasWorkScope.mockImplementation(
      (_user, scope) => scope === scopes.work.id.checks.read,
    );

    for (const intent of DISPATCH_INTENTS) {
      const result = await guardWorkCheckScopes(ctx, 'wv-1', intent);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.result).toEqual(rejectWorkChecksDispatch());
      }
    }
  });

  it('allows dispatch intents when user has dispatch scope', async () => {
    scmsServerMocks.userHasWorkScope.mockReturnValue(true);

    const result = await guardWorkCheckScopes(ctx, 'wv-1', 'execute');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workId).toBe('work-1');
      expect(result.ctx).toBe(ctx);
    }
  });

  it('does not mutate ctx.user after authorization', async () => {
    const sessionUser = { id: 'user-1', work_roles: [{ work_id: 'other-work', role: 'OWNER' }] };
    const sessionCtx = { user: sessionUser, $config: { app: {} } } as Context;
    scmsServerMocks.userHasWorkScope.mockReturnValue(true);

    await guardWorkCheckScopes(sessionCtx, 'wv-1', 'eula-status');

    expect(sessionCtx.user).toBe(sessionUser);
  });
});

describe('assertWorkChecksRead', () => {
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

  it('returns 401 when ctx has no user', async () => {
    const signedOutCtx = { ...ctx, user: undefined } as Context;
    const result = await assertWorkChecksRead(signedOutCtx, 'wv-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result).toEqual(rejectAuthenticationRequired());
    }
  });

  it('returns 401 for anonymous callers even when workVersionId does not exist', async () => {
    const findUnique = vi.fn(async () => null);
    scmsServerMocks.getPrismaClient.mockResolvedValue({
      workVersion: { findUnique },
    });
    const signedOutCtx = { ...ctx, user: undefined } as Context;

    const result = await assertWorkChecksRead(signedOutCtx, 'missing-wv');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result).toEqual(rejectAuthenticationRequired());
    }
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 when user lacks checks.read', async () => {
    const result = await assertWorkChecksRead(ctx, 'wv-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result).toEqual(rejectWorkChecksRead());
    }
  });
});

describe('assertWorkChecksReadForRun', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    scmsServerMocks.getPrismaClient.mockResolvedValue({
      workVersion: {
        findUnique: vi.fn(async () => ({ work_id: 'work-1' })),
      },
    });
  });

  it('returns 401 for anonymous download attempts', async () => {
    const signedOutCtx = { ...ctx, user: undefined } as Context;
    const result = await assertWorkChecksReadForRun(signedOutCtx, 'wv-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result).toEqual(rejectAuthenticationRequired());
    }
  });
});
