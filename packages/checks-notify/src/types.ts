export type CheckRunCoarseStatus = 'healthy' | 'error' | 'unknown';

export type CheckKind = 'proofig' | 'checks-text-integrity';

export type CheckRunContext = {
  checkRunId: string;
  checkKind: string;
  workVersionId: string;
  workId?: string;
  createdById?: string | null;
  coarseStatus?: CheckRunCoarseStatus | null;
};

export type CheckSlackOrigin = 'user' | 'admin' | 'sweep' | 'cron' | 'webhook' | 'job';
