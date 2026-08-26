import { hasError, proofigDataSchema } from '../schema.js';

const PROOFIG_KIND = 'proofig';

type RunRow = {
  kind: string;
  status?: string | null;
  data?: unknown;
};

/** True when a Proofig check run is in a retryable error state. */
export function isProofigRunFailed(run: RunRow): boolean {
  if (run.kind !== PROOFIG_KIND) return false;
  if (run.status === 'error') return true;

  // Legacy fallback for rows not yet reconciled onto columns.
  if (run.data == null || typeof run.data !== 'object') return false;
  const top = run.data as Record<string, unknown>;
  if (top.status === 'error') return true;
  const raw = top.serviceData;
  const parsed = proofigDataSchema.safeParse(raw);
  if (parsed.success && hasError(parsed.data)) return true;
  if (parsed.success && parsed.data.stages) {
    return Object.values(parsed.data.stages).some((stage) => stage?.status === 'error');
  }
  return false;
}
