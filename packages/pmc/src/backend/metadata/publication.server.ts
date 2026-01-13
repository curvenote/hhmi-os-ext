import { data as dataResponse } from 'react-router';
import { zfd } from 'zod-form-data';
import { withValidFormData, lookupMetadataFromDoi } from '@curvenote/scms-server';
import { z } from 'zod';
import { validateCrossrefResponse } from './crossref-validation.js';
import { safelyPatchPMCMetadata } from './utils.server.js';
import { PMCTrackEvent } from '../../analytics/events.js';
import { pmcMetadataSchema } from '../../common/metadata.schema.js';
import { validateJournalAgainstNIH } from '../services/nih-journal.server.js';
import { handleTestModeDOI } from './test-helpers.js';
import type { WorkContext } from '@curvenote/scms-server';

// Extract field schemas from the main metadata schema for form data
// Note: We use the partial schema shapes to allow clearing fields (empty strings)
const titleSchema = pmcMetadataSchema.shape.title.unwrap();
const journalNameSchema = z
  .string()
  .max(255, { message: 'Journal name must be at most 255 characters' }); // Allow empty for clearing

/**
 * Resets all publication metadata fields to undefined.
 * @param formData - Form data (unused, kept for API consistency)
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function resetPublicationMetadata(formData: FormData, workVersionId: string) {
  return safelyPatchPMCMetadata(workVersionId, {
    title: undefined,
    journalName: undefined,
    doiUrl: undefined,
    doiSuccess: undefined,
    doiPublishedDate: undefined,
    doiContainerTitle: undefined,
    doiShortContainerTitle: undefined,
    doiAuthors: undefined,
    doiType: undefined,
    doiVolume: undefined,
    doiIssue: undefined,
    doiPage: undefined,
    doiSource: undefined,
    doiPublisher: undefined,
    // Clear ISSN fields when resetting
    issn: undefined,
    issnType: undefined,
  });
}

/**
 * Updates the publication title in PMC metadata.
 * @param formData - Form data containing the title
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function updatePublicationTitle(formData: FormData, workVersionId: string) {
  return withValidFormData(
    zfd.formData({ title: titleSchema }),
    formData,
    async (data) => {
      const patch = {
        title: data.title.length > 0 ? data.title : undefined,
      };
      return safelyPatchPMCMetadata(workVersionId, patch);
    },
    { errorFields: { type: 'general' } },
  );
}

/**
 * Updates the publication journal name and validates it against the NIH Public Access list.
 * Also sets ISSN information from NIH validation.
 * @param formData - Form data containing the journal name
 * @param workVersionId - The work version ID
 * @returns Success response or error response if journal is not found
 */
export async function updatePublicationJournalName(formData: FormData, workVersionId: string) {
  return withValidFormData(
    zfd.formData({ journalName: journalNameSchema }),
    formData,
    async (data) => {
      const journalName = data.journalName.length > 0 ? data.journalName : undefined;

      // If we have a journal name, validate it against NIH and get ISSN information
      let issn: string | undefined;
      let issnType: 'print' | 'electronic' | undefined;

      if (journalName) {
        const nihValidation = await validateJournalAgainstNIH(journalName);

        if (!nihValidation.isValid) {
          return dataResponse(
            {
              error: {
                type: 'general',
                message: nihValidation.error || 'Journal not found in NIH Public Access list',
              },
            },
            { status: 422 },
          );
        }

        // Set ISSN information from NIH validation
        issn = nihValidation.issn;
        issnType = nihValidation.issnType;
      }

      const patch = {
        journalName,
        issn,
        issnType,
      };

      return safelyPatchPMCMetadata(workVersionId, patch);
    },
    { errorFields: { type: 'general' } },
  );
}

/**
 * Updates publication metadata by looking up a DOI and validating against NIH.
 * Extracts title, authors, journal, ISSN, and other metadata from Crossref.
 * @param ctx - Work context
 * @param formData - Form data containing the DOI
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function updatePublicationMetadataByDoi(
  ctx: WorkContext,
  formData: FormData,
  workVersionId: string,
) {
  const DoiLookupSchema = zfd.formData({
    doi: zfd.text(
      z.string().refine(
        (val) => {
          // First try to match URL format with DOI at the end
          const urlMatch = val.match(/^https?:\/\/[^/]+\/(?:.*\/)?(10\.\d{4,}\/[^\s]+)$/);
          if (urlMatch) {
            return true;
          }
          // Then try to match direct DOI format
          return /^10\.\d{4,}\/[^\s]+$/.test(val);
        },
        { message: 'Does not appear to be a valid DOI' },
      ),
    ),
  });
  return withValidFormData(
    DoiLookupSchema,
    formData,
    async (data) => {
      // Always trim whitespace from DOI
      const doi = data.doi.trim();

      // Handle test mode DOIs (only in development/test environments)
      if (process.env.NODE_ENV !== 'production') {
        const testResult = handleTestModeDOI(doi);
        if (testResult) {
          return testResult;
        }
      }

      try {
        const result = await lookupMetadataFromDoi(doi);

        // Validate Crossref response using Zod
        const validation = validateCrossrefResponse(result);
        if (!validation.success) {
          return dataResponse(
            {
              error: {
                type: 'general',
                message: validation.error.message,
              },
            },
            { status: 422 },
          );
        }

        const item = validation.item;

        // Extract ISSN from Crossref response with preference hierarchy
        const issnArray = item.ISSN || [];
        let selectedIssn: string | null = null;
        let selectedIssnType: 'print' | 'electronic' | null = null;

        // ISSN Type Preference: electronic > print
        if (issnArray.length > 0) {
          // Look for electronic ISSN first (typically no hyphens)
          const eissn = issnArray.find((issn: string) => !issn.includes('-'));
          if (eissn) {
            selectedIssn = eissn;
            selectedIssnType = 'electronic';
          } else {
            // Fallback to print ISSN (typically has hyphens)
            const pissn = issnArray.find((issn: string) => issn.includes('-'));
            if (pissn) {
              selectedIssn = pissn;
              selectedIssnType = 'print';
            }
          }
        }

        // Get container title (journal name) from the item
        const containerTitle = item['container-title'] || '';

        // NIH validation logic
        const nihValidation = await validateJournalAgainstNIH(
          containerTitle,
          selectedIssn ?? undefined,
        );

        // If NIH validation fails, return error (following current pattern)
        if (!nihValidation.isValid) {
          return dataResponse(
            {
              error: {
                type: 'general',
                message: nihValidation.error || 'Journal not found in NIH Public Access list',
              },
            },
            { status: 422 },
          );
        }

        const dateParts = item.published?.['date-parts']?.[0];
        let doiPublishedDate = undefined;

        if (dateParts && dateParts.length >= 1) {
          const year = dateParts[0];
          const month = dateParts[1] || 1; // Default to January if month is missing
          const day = dateParts[2] || 1; // Default to 1st if day is missing

          // Validate date parts before constructing the date string
          if (
            year &&
            year >= 1000 &&
            year <= 9999 &&
            month >= 1 &&
            month <= 12 &&
            day >= 1 &&
            day <= 31
          ) {
            // Additional validation: check if the date is actually valid
            const testDate = new Date(year, month - 1, day);
            if (
              testDate.getFullYear() === year &&
              testDate.getMonth() === month - 1 &&
              testDate.getDate() === day
            ) {
              doiPublishedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            } else {
              console.warn(`Invalid date parts from DOI: year=${year}, month=${month}, day=${day}`);
            }
          } else {
            console.warn(`Invalid date parts from DOI: year=${year}, month=${month}, day=${day}`);
          }
        }

        const metadataPatch = {
          doiSuccess: true,
          doiTitle: item.title,
          title: item.title,
          doiPublishedDate,
          doiContainerTitle: containerTitle,
          journalName: containerTitle,
          doiShortContainerTitle: item['short-container-title'],
          doiAuthors: item.author,
          doiType: item.type,
          doiVolume: item.volume,
          doiIssue: item.issue,
          doiUrl: item.URL,
          doiPage: item.page,
          doiSource: item.source,
          doiPublisher: item.publisher,
          // ISSN fields (use NIH validated ISSN or extracted ISSN)
          issn: nihValidation.issn || selectedIssn,
          issnType: nihValidation.issnType || selectedIssnType,
        };

        return safelyPatchPMCMetadata(workVersionId, metadataPatch).then(async (res) => {
          await ctx.trackEvent(PMCTrackEvent.PMC_DOI_LOOKUP_SUCCEEDED, {
            doi,
            title: item.title,
            journalName: containerTitle,
            publisher: item.publisher,
            publishedDate: doiPublishedDate,
          });
          await ctx.analytics.flush();
          return res;
        });
      } catch (error: any) {
        await ctx.trackEvent(PMCTrackEvent.PMC_DOI_LOOKUP_FAILED, {
          doi,
          error: error.statusText || 'DOI lookup failed',
        });
        await ctx.analytics.flush();

        if (error.status === 404) {
          return dataResponse(
            { error: { type: 'general', message: error.statusText || 'DOI not found' } },
            { status: 404 },
          );
        }
        return dataResponse(
          { error: { type: 'general', message: 'DOI lookup failed' } },
          { status: 422 },
        );
      }
    },
    { errorFields: { type: 'general' } },
  );
}
