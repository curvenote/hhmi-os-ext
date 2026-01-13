import type { DoiAuthor } from '../common/metadata.schema.js';

/**
 * Formats an array of authors into a comma-separated string with optional truncation.
 * @param authors - Array of DOI authors
 * @param opts - Options object with max number of authors to show
 * @returns Formatted author string or undefined if no authors
 */
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
