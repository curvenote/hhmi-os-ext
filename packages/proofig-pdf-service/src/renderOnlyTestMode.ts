/** When true, exposes POST /test-render (render-only, no SCMS job/upload/hook). */
export function isRenderOnlyTestMode(): boolean {
  return process.env.PROOFIG_PDF_RENDER_ONLY === '1';
}

/** Optional host directory (must be mounted in Docker) to copy the rendered PDF into. */
export function renderOutputDir(): string | undefined {
  const dir = process.env.RENDER_OUTPUT_DIR?.trim();
  return dir ? dir : undefined;
}
