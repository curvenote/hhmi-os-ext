import { AIRTABLE_CONFIG } from './airtableConfig.js';
import type { NormalizedScientist } from './types.js';
import { airtableFetch, airtableFetchAllPages } from './airtable.common.server.js';

// Field name helpers for cleaner code
const SCIENTIST_FIELDS = AIRTABLE_CONFIG.tables.scientists.fields;

export interface ScientistData {
  id: string;
  fields: Record<string, any>;
}

/**
 * Normalizes an Airtable scientist record to a standardized scientist format.
 * @param scientistData - Raw Airtable scientist data
 * @returns Normalized scientist record
 */
function normalizeScientist(scientistData: ScientistData): NormalizedScientist {
  const fields = scientistData.fields;

  return {
    id: scientistData.id,
    orcid: fields[SCIENTIST_FIELDS.orcid_identifier.id],
    firstName: fields[SCIENTIST_FIELDS.first_name_primary.id] || '',
    lastName: fields[SCIENTIST_FIELDS.last_name_primary.id] || '',
    fullName: fields[SCIENTIST_FIELDS.full_name_primary.id] || '',
    email: fields[SCIENTIST_FIELDS.email.id] || '',
    program: fields[SCIENTIST_FIELDS.program.id] || '',
    employeeId: fields[SCIENTIST_FIELDS.employee_id.id] || '',
    personId: fields[SCIENTIST_FIELDS.person_id.id] || '',
    appointmentStatus: fields[SCIENTIST_FIELDS.appointment_status.id] || '',
    hireDate: fields[SCIENTIST_FIELDS.hire_date_best.id] || '',
    lastReviewDate: fields[SCIENTIST_FIELDS.last_review_date.id] || '',
    institution: fields[SCIENTIST_FIELDS.institution.id] || '',
    complianceRateCoveredPreprints:
      Number(fields[SCIENTIST_FIELDS.compliance_rate_covered_preprints.id]) || 0,
    complianceRateCoveredPublications:
      Number(fields[SCIENTIST_FIELDS.compliance_rate_covered_publications.id]) || 0,
    nextReviewWithin2Years: !!fields[SCIENTIST_FIELDS.next_review_within_2_years.id] || false,
    preprints: {
      total: Number(fields[SCIENTIST_FIELDS.total_preprints.id]) || 0,
      totalSubjectToPolicy:
        Number(fields[SCIENTIST_FIELDS.total_preprints_subject_to_policy.id]) || 0,
      nonCompliant: Number(fields[SCIENTIST_FIELDS.non_compliant_preprints.id]) || 0,
      resolved: Number(fields[SCIENTIST_FIELDS.resolved_preprints.id]) || 0,
      originallyCompliant: Number(fields[SCIENTIST_FIELDS.originally_compliant_preprints.id]) || 0,
    },
    publications: {
      total: Number(fields[SCIENTIST_FIELDS.total_publications.id]) || 0,
      totalSubjectToPolicy:
        Number(fields[SCIENTIST_FIELDS.total_publications_subject_to_policy.id]) || 0,
      nonCompliant: Number(fields[SCIENTIST_FIELDS.non_compliant_publications.id]) || 0,
      resolved: Number(fields[SCIENTIST_FIELDS.resolved_publications.id]) || 0,
      originallyCompliant:
        Number(fields[SCIENTIST_FIELDS.originally_compliant_publications.id]) || 0,
    },
  };
}

/**
 * Lightweight check to see if a scientist exists in Airtable by ORCID.
 * This only checks existence without fetching or normalizing full scientist data.
 * Much faster than fetchScientistByOrcid since it doesn't process all fields.
 */
export async function checkScientistExistsByOrcid(orcid: string): Promise<boolean> {
  const scientistTableId = AIRTABLE_CONFIG.tables.scientists.id;
  const scientistOrcidFieldId = SCIENTIST_FIELDS.orcid_identifier.id;
  try {
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${scientistTableId}`,
    );
    url.searchParams.set(
      'filterByFormula',
      `FIND('${orcid.trim()}', {${scientistOrcidFieldId}}) > 0`,
    );
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('maxRecords', '1'); // Only need to know if at least one exists

    const scientistData = await airtableFetch(url, { cellFormat: 'string' });
    return (scientistData.records?.length ?? 0) > 0;
  } catch (error) {
    // If there's an error, assume the scientist doesn't exist
    console.error(`Error checking scientist existence for ORCID ${orcid}:`, error);
    return false;
  }
}

/**
 * Fetches a scientist by ORCID from Airtable.
 * @param orcid - ORCID identifier
 * @returns Object containing the scientist or an error message
 */
export async function fetchScientistByOrcid(orcid: string): Promise<{
  scientist: NormalizedScientist | undefined;
  error?: string;
}> {
  const scientistTableId = AIRTABLE_CONFIG.tables.scientists.id;
  const scientistOrcidFieldId = SCIENTIST_FIELDS.orcid_identifier.id;
  try {
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${scientistTableId}`,
    );
    url.searchParams.set(
      'filterByFormula',
      `FIND('${orcid.trim()}', {${scientistOrcidFieldId}}) > 0`,
    );
    url.searchParams.set('returnFieldsByFieldId', 'true');

    const scientistData = await airtableFetch(url, { cellFormat: 'string' });
    const rawScientist = scientistData.records?.[0]; // Only return the first scientist
    const scientist = rawScientist ? normalizeScientist(rawScientist) : undefined;
    return { scientist };
  } catch (error) {
    return {
      scientist: undefined,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Fetches all scientists from Airtable.
 * @returns Array of all normalized scientist records
 */
export async function fetchAllScientists(): Promise<NormalizedScientist[]> {
  const scientistsUrl = new URL(
    `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${AIRTABLE_CONFIG.tables.scientists.id}`,
  );

  const filterFormula = ``;
  scientistsUrl.searchParams.set('filterByFormula', filterFormula);

  const allRecords = await airtableFetchAllPages(scientistsUrl, { cellFormat: 'string' });
  return allRecords.map(normalizeScientist);
}
