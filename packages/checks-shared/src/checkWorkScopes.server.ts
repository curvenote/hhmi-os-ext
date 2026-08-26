import {
  dbGetUserWorkRoles,
  getPrismaClient,
  userHasWorkScope,
  type UserWithWorkRolesDBO,
} from '@curvenote/scms-server';
import { scopes, type Context, type ExtensionCheckHandleActionResult } from '@curvenote/scms-core';

/**
 * Work-scoped authorization for check extension routes.
 *
 * These helpers verify permissions against the authenticated session user in `ctx.user`.
 * They never mutate `ctx` or replace `ctx.user` — authorization uses a separate in-memory
 * user snapshot (with work roles loaded for the target work) only inside scope checks.
 */

export function rejectAuthenticationRequired(): ExtensionCheckHandleActionResult {
  return {
    error: { type: 'general', message: 'Authentication required' },
    status: 401,
  };
}

export function rejectWorkChecksRead(): ExtensionCheckHandleActionResult {
  return {
    error: {
      type: 'general',
      message: 'You do not have permission to view checks for this work',
    },
    status: 403,
  };
}

export function rejectWorkChecksDispatch(): ExtensionCheckHandleActionResult {
  return {
    error: {
      type: 'general',
      message: 'You do not have permission to dispatch checks for this work',
    },
    status: 403,
  };
}

export async function resolveWorkIdForWorkVersion(workVersionId: string): Promise<string | null> {
  const prisma = await getPrismaClient();
  const row = await prisma.workVersion.findUnique({
    where: { id: workVersionId },
    select: { work_id: true },
  });
  return row?.work_id ?? null;
}

/** Local user snapshot for scope checks — not written back to Context. */
async function loadWorkScopedUserForAuthorization(
  ctx: Context,
  workId: string,
): Promise<UserWithWorkRolesDBO | undefined> {
  if (!ctx.user?.id) return undefined;
  const workRoles = await dbGetUserWorkRoles(ctx.user.id, workId);
  return { ...ctx.user, work_roles: workRoles };
}

type WorkChecksReadAuthorization =
  | { ok: true; workId: string; authorizedUser: UserWithWorkRolesDBO }
  | { ok: false; result: ExtensionCheckHandleActionResult };

async function authorizeWorkChecksRead(
  ctx: Context,
  workVersionId: string,
): Promise<WorkChecksReadAuthorization> {
  if (!ctx.user?.id) {
    return { ok: false, result: rejectAuthenticationRequired() };
  }
  const workId = await resolveWorkIdForWorkVersion(workVersionId);
  if (!workId) {
    return {
      ok: false,
      result: {
        error: { type: 'general', message: 'Work version not found' },
        status: 404,
      },
    };
  }
  const authorizedUser = await loadWorkScopedUserForAuthorization(ctx, workId);
  if (!authorizedUser || !userHasWorkScope(authorizedUser, scopes.work.id.checks.read, workId)) {
    return { ok: false, result: rejectWorkChecksRead() };
  }
  return { ok: true, workId, authorizedUser };
}

export async function assertWorkChecksRead(
  ctx: Context,
  workVersionId: string,
): Promise<{ ok: true; workId: string } | { ok: false; result: ExtensionCheckHandleActionResult }> {
  const authorization = await authorizeWorkChecksRead(ctx, workVersionId);
  if (!authorization.ok) return authorization;
  return { ok: true, workId: authorization.workId };
}

export async function assertWorkChecksReadForRun(
  ctx: Context,
  workVersionId: string | null | undefined,
): Promise<{ ok: true; workId: string } | { ok: false; result: ExtensionCheckHandleActionResult }> {
  if (!workVersionId?.trim()) {
    return {
      ok: false,
      result: {
        error: { type: 'general', message: 'Work version not found for this check run' },
        status: 404,
      },
    };
  }
  return assertWorkChecksRead(ctx, workVersionId);
}

export function createWorkCheckScopeGuard(dispatchIntents: ReadonlySet<string>) {
  return async function guardWorkCheckScopes(
    ctx: Context | undefined,
    workVersionId: string | undefined,
    intent: string,
  ): Promise<
    | { ok: true; ctx: Context; workId: string }
    | { ok: false; result: ExtensionCheckHandleActionResult }
  > {
    if (!ctx?.user) {
      return { ok: false, result: rejectAuthenticationRequired() };
    }
    if (!workVersionId?.trim()) {
      return {
        ok: false,
        result: {
          error: { type: 'general', message: 'workVersionId is required' },
          status: 400,
        },
      };
    }

    const readAuthorization = await authorizeWorkChecksRead(ctx, workVersionId);
    if (!readAuthorization.ok) return readAuthorization;

    if (dispatchIntents.has(intent)) {
      if (
        !userHasWorkScope(
          readAuthorization.authorizedUser,
          scopes.work.id.checks.dispatch,
          readAuthorization.workId,
        )
      ) {
        return { ok: false, result: rejectWorkChecksDispatch() };
      }
    }

    return {
      ok: true,
      ctx,
      workId: readAuthorization.workId,
    };
  };
}
