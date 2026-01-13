import { AIRTABLE_CONFIG } from './airtableConfig.js';
import type { AirtableDTO, NormalizedArticleRecord } from './types.js';
import {
  cleanLicenseString,
  cleanString,
  extractORCIDs,
  fetchFilterAndNormalizeRecords,
  getBoolean,
  splitAuthorsField,
} from './airtable.common.server.js';

// Field name helpers for cleaner code
const PUBLICATION_FIELDS = AIRTABLE_CONFIG.tables.publications.fields;

/**
 * Normalizes an Airtable publication record to a standardized article record format.
 * @param publicationData - Raw Airtable DTO record
 * @param orcid - ORCID identifier for the scientist
 * @returns Normalized article record
 */
export function normalizePublicationRecordsToArticleRecord(
  publicationData: AirtableDTO,
  orcid: string,
): NormalizedArticleRecord {
  const fields = publicationData.fields;

  const title = cleanString(fields[PUBLICATION_FIELDS.title.id]);
  const authors = splitAuthorsField(fields[PUBLICATION_FIELDS.author_list_standardized.id]);
  const date = cleanString(fields[PUBLICATION_FIELDS.published_date.id]);
  const year = cleanString(fields[PUBLICATION_FIELDS.published_year.id]);

  const linkedScientists = cleanString(fields[PUBLICATION_FIELDS.linked_scientists.id]);
  const linkedScientistsOrcids = extractORCIDs(linkedScientists);

  return {
    id: publicationData.id,
    title,
    authors,
    date,
    year,

    compliant: getBoolean(fields[PUBLICATION_FIELDS.top_level_compliance.id]),
    everNonCompliant: getBoolean(fields[PUBLICATION_FIELDS.ever_non_compliant.id]),
    dateResolved: cleanString(fields[PUBLICATION_FIELDS.date_resolved_for_interface.id]),
    linkedScientistsOrcids,
    isLinkedToPrimaryOrcid: linkedScientistsOrcids.includes(orcid),
    topLevelPolicy: cleanString(fields[PUBLICATION_FIELDS.top_level_policy.id]),
    preprint: undefined,
    journal: {
      title,
      authors,
      date,
      year,
      doi: cleanString(fields[PUBLICATION_FIELDS.doi.id]),
      url: cleanString(fields[PUBLICATION_FIELDS.url.id]),
      pmid: cleanString(fields[PUBLICATION_FIELDS.pmid.id]),
      pmcid: cleanString(fields[PUBLICATION_FIELDS.pmcid.id]),
      publisher: cleanString(fields[PUBLICATION_FIELDS.publisher.id]),
      license: cleanLicenseString(fields[PUBLICATION_FIELDS.publisher_license_best.id]),
      complianceIssueType: cleanString(fields[PUBLICATION_FIELDS.issue_type.id]),
      complianceIssueStatus: cleanString(fields[PUBLICATION_FIELDS.status.id]),
      reviewReminder: cleanString(fields[PUBLICATION_FIELDS.review_reminder.id]),
      actionSteps: cleanString(fields[PUBLICATION_FIELDS.action_steps.id]),
    } satisfies NormalizedArticleRecord['journal'],
  } satisfies NormalizedArticleRecord;
}

/**
 * Fetches publications that are covered by the compliance policy for a given ORCID.
 * @param orcid - ORCID identifier
 * @returns Array of normalized article records for covered publications
 */
export async function fetchPublicationsCoveredByPolicy(
  orcid: string,
): Promise<NormalizedArticleRecord[]> {
  try {
    // Fetch publications by ORCID
    const escapedOrcid = orcid.trim().replace(/'/g, "\\'");
    const filterFormula = `AND(
    OR(
		  FIND('${escapedOrcid}', {${PUBLICATION_FIELDS.authorships_author_orcid.id}}) > 0,
		  FIND('${escapedOrcid}', {${PUBLICATION_FIELDS.linked_scientists.id}}) > 0
	  ),
    {${PUBLICATION_FIELDS.preprint_doi.id}} = BLANK(),
    {${PUBLICATION_FIELDS.linked_preprint.id}} = BLANK(),
	  {${PUBLICATION_FIELDS.is_covered_by_2022_policy_hhmi.id}},
	  {${PUBLICATION_FIELDS.not_subject_to_policy_reason.id}} = BLANK()
  )`;

    const records = await fetchFilterAndNormalizeRecords(
      AIRTABLE_CONFIG.tables.publications.id,
      orcid,
      filterFormula,
      normalizePublicationRecordsToArticleRecord,
      { cellFormat: 'string' }, // Return linked record names instead of IDs
    );
    return records;
  } catch {
    return [];
  }
}

/**
 * Fetches publications that are not covered by the compliance policy for a given ORCID.
 * @param orcid - ORCID identifier
 * @returns Array of normalized article records for non-covered publications
 */
export async function fetchPublicationsNotCoveredByPolicy(
  orcid: string,
): Promise<NormalizedArticleRecord[]> {
  try {
    const escapedOrcid = orcid.trim().replace(/'/g, "\\'");
    const filterFormula = `AND(
	    OR(
		    FIND('${escapedOrcid}', {${PUBLICATION_FIELDS.authorships_author_orcid.id}}) > 0,
		    FIND('${escapedOrcid}', {${PUBLICATION_FIELDS.linked_scientists.id}}) > 0
	    ),
	    {${PUBLICATION_FIELDS.not_subject_to_policy_reason.id}} != 'Not HHMI lab head',
	    {${PUBLICATION_FIELDS.preprint_doi.id}} = BLANK(),
	    {${PUBLICATION_FIELDS.linked_preprint.id}} = BLANK(),
	    OR(
		    NOT({${PUBLICATION_FIELDS.is_covered_by_2022_policy_hhmi.id}}),
		    NOT({${PUBLICATION_FIELDS.not_subject_to_policy_reason.id}} = BLANK())
	    )
	  )`;

    const records = await fetchFilterAndNormalizeRecords(
      AIRTABLE_CONFIG.tables.publications.id,
      orcid,
      filterFormula,
      normalizePublicationRecordsToArticleRecord,
      { cellFormat: 'string' }, // Return linked record names instead of IDs
    );
    return records;
  } catch {
    return [];
  }
}
