/** Per-user EULA acceptance stored on `User.data.checks.ithenticate`. */

export type IthenticateEulaAcceptance = {
  version: string;
  language: string;
  acceptedAt: string;
  shownAt?: string;
};

export type ChecksIthenticateUserData = {
  eula?: IthenticateEulaAcceptance;
};

export type UserDataWithChecks = {
  checks?: {
    ithenticate?: ChecksIthenticateUserData;
  };
};

export function readIthenticateEulaAcceptance(
  userData: unknown,
): IthenticateEulaAcceptance | undefined {
  if (userData == null || typeof userData !== 'object' || Array.isArray(userData)) {
    return undefined;
  }
  const checks = (userData as UserDataWithChecks).checks;
  const eula = checks?.ithenticate?.eula;
  if (!eula || typeof eula !== 'object') return undefined;
  if (typeof eula.version !== 'string' || typeof eula.acceptedAt !== 'string') {
    return undefined;
  }
  return {
    version: eula.version,
    language: typeof eula.language === 'string' ? eula.language : 'en-US',
    acceptedAt: eula.acceptedAt,
    shownAt: typeof eula.shownAt === 'string' ? eula.shownAt : undefined,
  };
}

export function mergeIthenticateEulaAcceptance(
  userData: unknown,
  acceptance: IthenticateEulaAcceptance,
): UserDataWithChecks & Record<string, unknown> {
  const base =
    userData != null && typeof userData === 'object' && !Array.isArray(userData)
      ? { ...(userData as Record<string, unknown>) }
      : {};
  const checks =
    base.checks != null && typeof base.checks === 'object' && !Array.isArray(base.checks)
      ? { ...(base.checks as Record<string, unknown>) }
      : {};
  const ithenticate =
    checks.ithenticate != null &&
    typeof checks.ithenticate === 'object' &&
    !Array.isArray(checks.ithenticate)
      ? { ...(checks.ithenticate as Record<string, unknown>) }
      : {};
  return {
    ...base,
    checks: {
      ...checks,
      ithenticate: {
        ...ithenticate,
        eula: acceptance,
      },
    },
  };
}
