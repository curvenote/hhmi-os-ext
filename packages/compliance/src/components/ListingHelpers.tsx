/**
 * Summarizes an author list, showing first and last author with count for long lists.
 * @param authors - Array of author names
 * @returns Formatted author string or React node
 */
export function summarizeAuthorList(authors?: string[]) {
  if (!authors) return '';
  if (authors.length < 5) return authors.join(', ');
  return (
    <span>
      {authors[0]}
      {', '}
      <span className="italic text-muted-foreground">+{authors.length - 2} more authors...</span>
      {', '}
      {authors[authors.length - 1]}
    </span>
  );
}
