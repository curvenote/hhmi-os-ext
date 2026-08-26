import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';

export type RenderReportPdfOptions = {
  /** Fully formed report URL (including access token). */
  reportUrl: string;
  /** Directory to write the PDF into. */
  outputDir: string;
  /** Output filename (defaults to report.pdf). */
  filename?: string;
  /** Milliseconds to wait for navigation network idle (default 60s). */
  navigationTimeoutMs?: number;
};

export type RenderReportPdfResult = {
  localPath: string;
  size: number;
};

const PDF_MAGIC = Buffer.from('%PDF-', 'utf-8');

/**
 * Playwright `page.pdf({ scale })` default is 1 (100%). We were not setting it,
 * but a 1280px viewport made Chromium shrink-to-fit the layout onto A4, which
 * looks like a low zoom. Prefer an A4-ish viewport and a slight explicit scale.
 */
const PDF_SCALE = 1.25;
/** ~A4 width at 96dpi is ~794px; stay a bit wider for app chrome without heavy shrink. */
const PRINT_VIEWPORT = { width: 900, height: 1270 } as const;

/**
 * Chromium's print engine often clips text mid-glyph when an ancestor has
 * `overflow: hidden` (common in app shells / cards). Force visible overflow for
 * print. Prefer `@page` margins (content reflows) over Playwright `margin`
 * options, which shrink the paint box and can re-introduce clipping.
 */
const PRINT_CLIP_FIX_CSS = `
  @media print {
    @page {
      margin: 1.2cm;
    }
    html, body {
      height: auto !important;
      overflow: visible !important;
    }
    *, *::before, *::after {
      overflow: visible !important;
      text-overflow: clip !important;
    }
  }
`;

/** Basic guard that the written file is actually a PDF. */
async function assertIsPdf(localPath: string): Promise<number> {
  const stat = await fs.stat(localPath);
  const fh = await fs.open(localPath, 'r');
  try {
    const header = Buffer.alloc(PDF_MAGIC.length);
    await fh.read(header, 0, PDF_MAGIC.length, 0);
    if (!header.equals(PDF_MAGIC)) {
      throw new Error('Rendered file is not a PDF (missing %PDF- magic bytes)');
    }
  } finally {
    await fh.close();
  }
  return stat.size;
}

/**
 * Open a Proofig report URL in headless Chromium, emulate print media (so the
 * Proofig print stylesheet applies, matching the browser "Save as PDF" flow),
 * and write the printed PDF to disk.
 */
export async function renderReportPdf(
  options: RenderReportPdfOptions,
): Promise<RenderReportPdfResult> {
  const { reportUrl, outputDir, filename = 'report.pdf', navigationTimeoutMs = 60_000 } = options;

  await fs.mkdir(outputDir, { recursive: true });
  const localPath = path.join(outputDir, filename);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({
      viewport: PRINT_VIEWPORT,
    });
    await page.goto(reportUrl, { waitUntil: 'networkidle', timeout: navigationTimeoutMs });
    await page.evaluate(async () => {
      // Wait for webfonts so glyph metrics match what print layout expects.
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await page.emulateMedia({ media: 'print' });
    await page.addStyleTag({ content: PRINT_CLIP_FIX_CSS });
    await page.pdf({
      path: localPath,
      format: 'A4',
      printBackground: true,
      scale: PDF_SCALE,
      // Keep API margins at 0 — spacing comes from @page in PRINT_CLIP_FIX_CSS so
      // content reflows instead of being cropped (which re-introduces clipping).
      preferCSSPageSize: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const size = await assertIsPdf(localPath);
  return { localPath, size };
}
