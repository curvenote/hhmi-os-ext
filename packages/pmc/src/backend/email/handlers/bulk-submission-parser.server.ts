import { extractManuscriptId } from './email-parsing-utils.server.js';

/**
 * Result of bulk submission email parsing
 * This is specific to bulk submission emails which contain multiple packages
 */
export interface ParsedEmailResult {
  type: 'success' | 'warning' | 'error';
  packages: PackageResult[];
}

/**
 * Individual package result from bulk submission email
 */
export interface PackageResult {
  packageId: string;
  manuscriptId?: string;
  status: 'success' | 'warning' | 'error';
  message?: string;
}

/** Phrase that indicates the "direct submission only" error from PMC */
const DIRECT_SUBMISSION_ONLY_PHRASE = 'should be submitted directly to PMC';

/**
 * Returns true if the error message indicates that the journal requires
 * direct submission to PMC (bulk submission not accepted).
 */
export function isDirectSubmissionOnlyError(message: string | undefined): boolean {
  if (!message || typeof message !== 'string') return false;
  return message.toLowerCase().includes(DIRECT_SUBMISSION_ONLY_PHRASE.toLowerCase());
}

/**
 * Extracts package ID from text using regex patterns
 */
export function extractPackageId(text: string): string | null {
  // Look for patterns like "Package ID=xxxxx", "Package ID = xxxxx", "Package ID xxxxx"
  // Handle various whitespace characters: spaces, tabs, newlines, carriage returns
  // Package IDs can be alphanumeric or UUIDs with hyphens
  const patterns = [
    /Package[\s\t\n\r]+ID[\s\t\n\r]*=[\s\t\n\r]*([a-zA-Z0-9-]+)/i,
    /Package[\s\t\n\r]+ID[\s\t\n\r]+([a-zA-Z0-9-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Determines the message type based on content analysis (both plain text and HTML)
 */
export function determineMessageType(plain: string, html: string): 'success' | 'warning' | 'error' {
  const content = (html || plain || '').toLowerCase();

  // Check for INFO cells (correlates with success)
  if (content.includes('info') || content.includes('successfully')) {
    return 'success';
  }

  // Check for error indicators
  if (content.includes('error') || content.includes('failed')) {
    return 'error';
  }

  // Check for warning indicators
  if (content.includes('warning')) {
    return 'warning';
  }

  // Check for success indicators
  if (content.includes('success')) {
    return 'success';
  }

  // Default to success if no error/warning indicators found
  return 'success';
}

/**
 * Extracts error or warning message from content
 * Optionally pass statusCell for table parsing
 */
export function extractMessage(content: string, statusCell?: string): string | undefined {
  // Clean up HTML entities first
  let message = content
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Remove HTML tags, but preserve tags like <string> and variable placeholders like <VAR-*> that are part of the message
  message = message.replace(/<(?!string>|VAR-)[^>]+>/gi, '');

  // Normalize whitespace - handle tabs, newlines, carriage returns, and multiple spaces
  message = message
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (statusCell) {
    // For table rows, do not remove any prefixes or clean up further, just return the cleaned message
    return message || undefined;
  }

  // For non-table content, do full cleanup
  // Replace <error> and </error> tags with the word 'error'
  message = message.replace(/<error>/gi, 'error').replace(/<\/error>/gi, 'error');

  // Remove quotes around single words
  message = message.replace(/"([^"]+)"/g, '$1');

  // Remove a leading status (ERROR|WARNING) if present
  message = message.replace(/^(ERROR|WARNING)[:\s-]*/i, '').trim();

  // Remove only the 'Package ID=...' prefix at the start, but keep the rest of the message
  // Handle variable placeholders and various whitespace characters
  message = message.replace(/^Package\s+ID\s*=\s*[^\s]+\s*/i, '').trim();

  return message || undefined;
}

/**
 * Parses HTML table rows to extract package information
 */
export function parseHTMLTableRows(html: string): PackageResult[] {
  const packages: PackageResult[] = [];

  // Extract table rows that contain package information
  const tableRowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
  const rows = html.match(tableRowRegex) || [];

  for (const row of rows) {
    // Extract <td> cells
    const cellRegex = /<td[^>]*>(.*?)<\/td>/gis;
    const cells = Array.from(row.matchAll(cellRegex)).map((match) => match[1]);
    if (cells.length < 2) continue;

    // First cell: status (ERROR/WARNING/INFO), second cell: message
    const statusCell = cells[0].replace(/<[^>]*>/g, '').trim();
    const messageCell = cells[1];

    // Determine status based on status cell content
    let status: 'success' | 'warning' | 'error';
    if (statusCell.toLowerCase().includes('info')) {
      status = 'success';
    } else if (statusCell.toLowerCase().includes('warning')) {
      status = 'warning';
    } else if (statusCell.toLowerCase().includes('error')) {
      status = 'error';
    } else {
      // Fallback to content analysis
      status = determineMessageType('', messageCell);
    }

    const packageId = extractPackageId(messageCell);
    if (!packageId) continue;
    const manuscriptId =
      status !== 'error' ? extractManuscriptId(messageCell) || undefined : undefined;
    const message = extractMessage(messageCell, statusCell);
    packages.push({
      packageId,
      manuscriptId,
      status,
      message,
    });
  }
  return packages;
}

/**
 * Parses email content to extract package results
 */
export function parseEmailContent(plain: string, html: string): ParsedEmailResult {
  const type = determineMessageType(plain, html);
  const content = html || plain || '';

  // Try to parse multiple packages from HTML table first
  let packages: PackageResult[] = [];

  if (html) {
    packages = parseHTMLTableRows(html);
  }

  // If no packages found in HTML table, fall back to single package extraction
  if (packages.length === 0) {
    // Extract package ID
    const packageId = extractPackageId(content);
    if (!packageId) {
      // If we can't find a package ID, create an error result
      return {
        type: 'error',
        packages: [
          {
            packageId: 'unknown',
            status: 'error',
            message: 'Could not extract package ID from email content',
          },
        ],
      };
    }

    // Extract manuscript ID (only for success/warning messages)
    const manuscriptId = type !== 'error' ? extractManuscriptId(content) || undefined : undefined;

    // Extract message
    const message = extractMessage(content);

    // Create package result
    const packageResult: PackageResult = {
      packageId,
      manuscriptId,
      status: type,
      message,
    };

    packages.push(packageResult);
  }

  return {
    type,
    packages,
  };
}
