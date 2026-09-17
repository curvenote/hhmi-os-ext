import type { DoiAuthor } from '../common/metadata.schema.js';

/**
 * Formats an array of authors into a comma-separated string with optional truncation.
 * @param authors - Array of DOI authors
 * @param opts - Options object with max number of authors to show
 * @returns Formatted author string or undefined if no authors
 */
/**
 * Formats a NIHMS manuscript ID for display, e.g. `2109555` -> `NIHMS2109555`.
 *
 * Stored IDs are bare digits — `extractManuscriptId` captures the number only — but
 * IDs already carrying the prefix are normalised rather than doubled up, and
 * non-numeric IDs (the `Manuscript ID <alphanumeric>` email pattern) are left alone
 * because they are not NIHMS numbers.
 */
export function formatManuscriptId(manuscriptId?: string | null): string | undefined {
  const id = manuscriptId?.trim();
  if (!id) return undefined;
  const digits = id.replace(/^NIHMS\s*/i, '');
  return /^\d+$/.test(digits) ? `NIHMS${digits}` : id;
}

export function formatAuthors(authors?: DoiAuthor[], opts: { max?: number } = {}) {
  const { max = 3 } = opts;
  if (!authors || !Array.isArray(authors) || authors.length === 0) return;
  const suffix = authors.length && authors.length > max ? ` +${authors.length - max} others.` : '';
  return (
    authors
      .slice(0, max)
      .map((author) => `${author.family}`)
      .join(', ') + suffix
  );
}
