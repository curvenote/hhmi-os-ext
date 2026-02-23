import { AIRTABLE_CONFIG } from './airtableConfig.js';
import { airtableFetchAllPages } from './airtable.common.server.js';

const JOURNAL_FIELDS = AIRTABLE_CONFIG.tables.journals.fields;

export interface NormalizedJournal {
  id: string;
  journal_name: string;
  type: string;
  payment_instruction_override: string;
}

interface JournalRecord {
  id: string;
  fields: Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return (value[0] != null ? String(value[0]) : '') || '';
  return String(value);
}

function normalizeJournal(record: JournalRecord): NormalizedJournal {
  const fields = record.fields;
  const journalNameId = JOURNAL_FIELDS.journal_name.id;
  const typeId = JOURNAL_FIELDS.type.id;
  const overrideId = JOURNAL_FIELDS.payment_instruction_override.id;

  return {
    id: record.id,
    journal_name: asString(fields[journalNameId]),
    type: asString(fields[typeId]),
    payment_instruction_override: asString(fields[overrideId]),
  };
}

/**
 * Fetches all journals from Airtable (journal_name, type, payment_instruction_override).
 * @returns Array of normalized journal records
 */
export async function fetchAllJournals(): Promise<NormalizedJournal[]> {
  const url = new URL(
    `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${AIRTABLE_CONFIG.tables.journals.id}`,
  );
  url.searchParams.set('filterByFormula', '');

  const allRecords = await airtableFetchAllPages(url, { cellFormat: 'string' });
  return allRecords.map((r: JournalRecord) => normalizeJournal(r));
}
