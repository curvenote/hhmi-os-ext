import { canShowResults, hasPipelineError } from '../serviceDataSchemas.js';
import { textIntegrityDataSchema } from '../schema.js';

const TEXT_INTEGRITY_KIND = 'checks-text-integrity';

type RunRow = {
  kind: string;
  status?: string | null;
  data?: unknown;
};

function readServiceData(runData: unknown) {
  if (runData == null || typeof runData !== 'object') return undefined;
  const raw = (runData as Record<string, unknown>).serviceData;
  const parsed = textIntegrityDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** True when a Text Integrity check run is in a retryable error state. */
export function isTextIntegrityRunFailed(run: RunRow): boolean {
  if (run.kind !== TEXT_INTEGRITY_KIND) return false;
  if (run.status === 'error') return true;

  // Legacy fallback for rows not yet reconciled onto columns.
  if (run.data == null || typeof run.data !== 'object') return false;
  const top = run.data as Record<string, unknown>;
  if (top.status === 'error') return true;
  const serviceData = readServiceData(run.data);
  if (hasPipelineError(serviceData)) return true;
  if (canShowResults(serviceData) && !serviceData?.summaryReport) return true;
  return false;
}
