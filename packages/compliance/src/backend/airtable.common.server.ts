import { getAirtableApiKey } from './airtableConfig.server.js';
import { AIRTABLE_CONFIG } from './airtableConfig.js';
import type { AirtableDTO, NormalizedArticleRecord } from './types.js';

// Airtable Metadata API types
export interface AirtableFieldMetadata {
  id: string;
  name: string;
  type: string;
  description?: string;
  options?: Record<string, any>;
}

export interface AirtableViewMetadata {
  id: string;
  name: string;
  type: string;
}

export interface AirtableTableMetadata {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: AirtableFieldMetadata[];
  views: AirtableViewMetadata[];
  description?: string;
}

export interface AirtableTablesMetadataResponse {
  tables: AirtableTableMetadata[];
}

export interface AirtableFieldWithTable extends AirtableFieldMetadata {
  tableId: string;
  tableName: string;
}

export type AirtableFieldMappings = Record<string, AirtableFieldWithTable>;

/**
 * Fetches data from Airtable API with authentication and optional formatting options.
 * @param url - Airtable API URL
 * @param options - Optional formatting options (cellFormat, timeZone, userLocale)
 * @returns JSON response from Airtable API
 * @throws Error if base ID or API key is missing, or if the request fails
 */
export async function airtableFetch(
  url: URL,
  options: { cellFormat?: 'json' | 'string'; timeZone?: string; userLocale?: string } = {},
) {
  if (!AIRTABLE_CONFIG.baseId) {
    throw new Error('Airtable base ID is missing. Please update AIRTABLE_CONFIG.');
  }

  const apiKey = await getAirtableApiKey();
  if (!apiKey) {
    throw new Error('Airtable API key is missing. Please update the app-config.');
  }

  // Use cellFormat=string to get linked record names instead of IDs
  if (options.cellFormat) {
    url.searchParams.set('cellFormat', options.cellFormat);

    // When using cellFormat=string, timeZone and userLocale are required
    if (options.cellFormat === 'string') {
      url.searchParams.set('timeZone', options.timeZone || 'America/New_York');
      url.searchParams.set('userLocale', options.userLocale || 'en-us');
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('Airtable fetch error:', response.statusText);
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches all pages of records from Airtable, handling pagination automatically.
 * @param baseUrl - Base Airtable API URL
 * @param options - Optional formatting options
 * @returns Array of all records from all pages
 */
export async function airtableFetchAllPages(
  baseUrl: URL,
  options: { cellFormat?: 'json' | 'string'; timeZone?: string; userLocale?: string } = {},
): Promise<any[]> {
  const allRecords: AirtableDTO[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(baseUrl.toString());
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('returnFieldsByFieldId', 'true'); // Return fields keyed by ID instead of name

    if (offset) {
      url.searchParams.set('offset', offset);
    }

    const data = await airtableFetch(url, options);

    if (data.records) {
      allRecords.push(...data.records);
    }

    offset = data.offset;
  } while (offset);

  return allRecords;
}

/**
 * Fetches field mappings from Airtable metadata API for tables in use.
 * @returns Object mapping field IDs to field metadata with table information
 */
async function airtableFetchFieldMappings(): Promise<AirtableFieldMappings> {
  const url = new URL(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_CONFIG.baseId}/tables`);
  const data = (await airtableFetch(url)) as AirtableTablesMetadataResponse;

  const tablesInUse = [
    AIRTABLE_CONFIG.tables.publications.id,
    AIRTABLE_CONFIG.tables.preprints.id,
    AIRTABLE_CONFIG.tables.scientists.id,
  ];

  const tables = data.tables.filter((table) => tablesInUse.includes(table.id));

  // Build an object allowing quick lookup of the entire field object (with tableId) by field id
  const fieldsMap: AirtableFieldMappings = {};
  for (const table of tables) {
    for (const field of table.fields) {
      fieldsMap[field.id] = {
        ...field,
        tableId: table.id,
        tableName: table.name,
      };
    }
  }

  return fieldsMap;
}

/**
 * Fetches current Airtable field mappings with error handling.
 * @returns Object containing mappings or error message
 */
export async function fetchCurrentFieldMappings(): Promise<{
  mappings: AirtableFieldMappings | undefined;
  error?: string;
}> {
  try {
    const fieldMappings = await airtableFetchFieldMappings();
    return { mappings: fieldMappings };
  } catch (error) {
    return {
      mappings: undefined,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Cleans a string by removing replacement characters and HTML tags.
 * Handles both string and array inputs.
 * @param maybeString - String, array of strings, or undefined
 * @returns Cleaned string or undefined
 */
export function cleanString(maybeString: string[] | string | undefined): string | undefined {
  if (!maybeString) return undefined;

  let stringToClean: string = '';
  if (Array.isArray(maybeString)) {
    stringToClean = maybeString.join(' ');
  } else {
    stringToClean = maybeString;
  }

  // Remove the replacement character and strip HTML tags
  return stringToClean?.replace(/�/g, '').replace(/<[^>]*>/g, '');
}

/**
 * Cleans a license string by removing replacement characters, HTML tags, and replacing underscores with hyphens.
 * @param maybeString - String, array of strings, or undefined
 * @returns Cleaned license string or undefined
 */
export function cleanLicenseString(maybeString: string[] | string | undefined): string | undefined {
  return cleanString(maybeString)?.replace(/_/g, '-');
}

/**
 * Converts a value to a boolean, handling various string representations.
 * @param value - String or boolean value to convert
 * @returns Boolean value or undefined if conversion fails
 */
export function getBoolean(value: string | boolean): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value.toString().toLowerCase() === 'true' || value.toString().toLowerCase() === 'checked')
    return true;
  if (value.toString().toLowerCase() === 'false') return false;
  return undefined;
}

/**
 * Splits an authors field into an array, handling multiple formats and separators.
 * Supports both "Last, First." and "First Last" formats.
 * @param field - String or array of strings containing authors
 * @param options - Options object with unique flag to remove duplicates
 * @returns Array of author strings
 */
export function splitAuthorsField(
  field: string[] | string | undefined,
  { unique = false }: { unique?: boolean } = {},
): string[] {
  if (!field) return [];

  let fieldAsString: string = '';
  if (Array.isArray(field)) {
    fieldAsString = field.join(';');
  } else {
    fieldAsString = field;
  }

  try {
    // First split on primary separators: semicolons, newlines, and pipes
    const segments = fieldAsString.split(/;|\n|\|/).filter((s) => s.trim().length > 0);

    const authors: string[] = [];

    for (const segment of segments) {
      const trimmedSegment = segment.trim();

      // Detect format by checking for pattern: period followed by comma
      // This pattern appears in "Last, F. M., " format between authors
      // Pattern: \.\s*,\s* (period, optional spaces, comma, optional spaces)
      const hasPeriodCommaPattern = /\.\s*,\s*/.test(trimmedSegment);

      // Also check if segment ends with period and has commas (single author in Last, First format)
      const endsWithPeriod = trimmedSegment.endsWith('.');
      const hasComma = trimmedSegment.includes(',');

      // Detect "Last, First Middle." format if:
      // 1. Has period-comma pattern (multiple authors), OR
      // 2. Ends with period AND has comma (single author)
      const hasLastFirstFormat = hasPeriodCommaPattern || (endsWithPeriod && hasComma);

      if (hasLastFirstFormat) {
        // Format: "Last, First Middle., Last2, First2., ..."
        // Split on period-comma pattern and add the period back to each author
        // Use regex to split on: period + optional space + comma + optional space
        const parts = trimmedSegment.split(/\.\s*,\s*/);

        // If we only got one part, it means there's no period-comma pattern
        // This is a single author in "Last, First." format - keep it as is
        if (parts.length === 1) {
          authors.push(trimmedSegment);
        } else {
          parts.forEach((part, index) => {
            const trimmedPart = part.trim();
            if (trimmedPart.length > 0) {
              // Add period back to all parts except possibly the last one
              if (index < parts.length - 1) {
                // Not the last part - definitely needs a period
                authors.push(trimmedPart + '.');
              } else {
                // Last part: check if it already ends with period
                authors.push(trimmedPart.endsWith('.') ? trimmedPart : trimmedPart + '.');
              }
            }
          });
        }
      } else {
        // Format: "First Middle Last, First2 Last2, ..."
        // Simple comma split
        const parts = trimmedSegment.split(',');
        parts.forEach((part) => {
          const trimmedPart = part.trim();
          if (trimmedPart.length > 0) {
            authors.push(trimmedPart);
          }
        });
      }
    }

    if (authors.length > 0 && unique) {
      return authors.filter((s, index, self) => self.indexOf(s) === index);
    }
    return authors;
  } catch (error) {
    console.error('Error splitting field!!!:', error);
    throw error;
  }
}

/**
 * Extracts URL from a Query OpenAlex object.
 * @param queryOpenAlex - OpenAlex query object
 * @returns URL string or empty string if not found
 */
export function getQueryOpenAlexUrl(queryOpenAlex: any): string {
  if (queryOpenAlex && typeof queryOpenAlex === 'object' && queryOpenAlex.url) {
    return queryOpenAlex.url;
  }
  return '';
}

/**
 * Fetches records from Airtable, filters them, and normalizes them using a provided function.
 * @param tableId - Airtable table ID
 * @param orcid - ORCID identifier for filtering
 * @param filterFormula - Airtable filter formula
 * @param normalizeFunction - Function to normalize each record
 * @param options - Optional formatting options
 * @returns Array of normalized article records
 */
export async function fetchFilterAndNormalizeRecords(
  tableId: string,
  orcid: string,
  filterFormula: string,
  normalizeFunction: (record: AirtableDTO, orcid: string) => NormalizedArticleRecord,
  options: { cellFormat?: 'json' | 'string'; timeZone?: string; userLocale?: string } = {},
): Promise<NormalizedArticleRecord[]> {
  try {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${tableId}`);
    url.searchParams.set('filterByFormula', filterFormula);

    const allRecords = await airtableFetchAllPages(url, options);
    const normalizedRecords = allRecords.map((record) => normalizeFunction(record, orcid));
    return normalizedRecords;
  } catch (error) {
    console.error('Error fetching records:', error);
    return [];
  }
}

/**
 * Extracts ORCID IDs from a text string that may contain URLs or plain ORCID IDs.
 * ORCID format: XXXX-XXXX-XXXX-XXXX (4 groups of 4 alphanumeric characters separated by hyphens)
 *
 * @param text - String that may contain ORCID IDs or URLs
 * @returns Array of ORCID IDs found in the text
 *
 * @example
 * extractOrcidIds("Zhijian (James) Chen - https://orcid.org/0000-0002-8475-8251")
 * // Returns: ["0000-0002-8475-8251"]
 *
 * @example
 * extractOrcidIds("0000-0001-1234-5678, 0000-0002-8475-8251")
 * // Returns: ["0000-0001-1234-5678", "0000-0002-8475-8251"]
 */
export function extractORCIDs(text: string | undefined): string[] {
  if (!text) return [];

  // ORCID pattern: 4 groups of 4 characters (digits or X) separated by hyphens
  // Matches both standalone IDs and IDs in URLs
  const orcidPattern = /\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/g;

  const matches = text.match(orcidPattern);
  if (!matches) return [];

  // Remove duplicates and return
  return [...new Set(matches)];
}
