export type RetryCronDisplaySnapshot = {
  installed: boolean;
  cronJob?: {
    id: string;
    name: string;
    schedule: string;
    enabled: boolean;
    targetUrl: string | null;
    targetScope: string | null;
    lastRunAt: string | null;
    lastStatus: string | null;
    nextRunAt: string | null;
  };
};

/** Resolve displayed cron state; install snapshot is only used during post-install refresh. */
export function resolveRetryCronDisplaySnapshot(
  statusRetryCron: RetryCronDisplaySnapshot | undefined,
  installRetryCron: RetryCronDisplaySnapshot | undefined,
  preferInstallSnapshot = false,
): RetryCronDisplaySnapshot | undefined {
  const useInstallSnapshot = preferInstallSnapshot && installRetryCron?.installed === true;
  return useInstallSnapshot ? installRetryCron : (statusRetryCron ?? installRetryCron);
}
