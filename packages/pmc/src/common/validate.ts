import type { WorkVersionMetadata, SubmissionVersionMetadata } from '@curvenote/scms-server';
import type {
  PMCWorkVersionMetadataSection,
  PMCSubmissionVersionMetadataSection,
} from './metadata.schema.js';
import { validatePMCSchema } from './metadata.schema.js';
import type { GeneralError, FileMetadataSection } from '@curvenote/scms-core';
import { FileMetadataSectionSchema } from '@curvenote/scms-core';
import type { ZodIssue } from 'zod';
import { PMC_FUNDERS_MAP } from '../components/funders.js';

export type PMCWorkVersionMetadata = WorkVersionMetadata &
  PMCWorkVersionMetadataSection &
  FileMetadataSection;

export type PMCSubmissionVersionMetadata = SubmissionVersionMetadata &
  PMCSubmissionVersionMetadataSection;

/**
 * Validates PMC metadata including files, grants, and conditional requirements.
 * @param metadata - The PMC work version metadata to validate
 * @returns Validation result with success status, error, or validation errors
 */
export async function validatePMCMetadata(
  metadata: PMCWorkVersionMetadata,
): Promise<{ success?: boolean; error?: GeneralError; validationErrors?: ZodIssue[] }> {
  const { files, pmc } = metadata;
  const allErrors: ZodIssue[] = [];

  // Validate the shape of items in the files section
  const filesResult = FileMetadataSectionSchema.safeParse({ files });
  if (!filesResult.success) {
    allErrors.push(...filesResult.error.issues);
  }

  // Validate PMC Metadata Section, including conditional validation

  const pmcResult = validatePMCSchema.safeParse(pmc);
  if (!pmcResult.success) {
    allErrors.push(...pmcResult.error.issues);
  }

  // Manual conditional validation checks
  // These run regardless of whether basic validation passes

  // Check for minimum required files
  // there must be at least one file in the 'manuscript' slot
  const manuscriptFiles = Object.values(files || {}).filter(
    (file) => file.slot === 'pmc/manuscript',
  );
  if (!manuscriptFiles || manuscriptFiles.length === 0) {
    // Add a custom error for missing manuscript files
    allErrors.push({
      code: 'custom',
      message: 'At least one manuscript file is required',
      path: ['files'],
    } as ZodIssue);
  }

  // Check for HHMI requirement (runs regardless of other validation errors)
  const hhmiGrant = (pmc?.grants || []).find((grant) => grant.funderKey === 'hhmi');

  if (
    pmc?.grants &&
    pmc?.grants.length > 0 &&
    (!hhmiGrant || !hhmiGrant.grantId || hhmiGrant.grantId.trim() === '')
  ) {
    // No HHMI grant found at all
    allErrors.push({
      code: 'custom',
      message: 'Select the HHMI Award recipient',
      path: ['grants'],
    } as ZodIssue);
  }

  // Filter out redundant errors and improve grant error messages
  const filteredErrors = allErrors.filter((error) => {
    // Remove generic "Files is required" error if we have the specific manuscript file error
    const hasManuscriptError = allErrors.some(
      (e) => e.path.join('.') === 'files' && e.message.includes('manuscript file is required'),
    );

    /**
     * IMPORTANT: Check error code instead of message to avoid Zod version dependencies
     *
     * Reason for change: The Zod upgrade (as part of React Router v7 migration) changed
     * error messages for missing required fields:
     *   - Old Zod: "Required"
     *   - New Zod: "Invalid input: expected object, received undefined"
     *
     * Alternative solution (NOT USED):
     * We could check for both message formats:
     *   error.message === 'Required' || error.message.includes('Invalid input: expected')
     *
     * However, this is fragile and will break again if Zod changes messages in the future.
     *
     * Better solution (IMPLEMENTED):
     * Check the error.code ('invalid_type') and error.path instead of error.message.
     * This is more robust as error codes are part of Zod's stable API, while error
     * messages are considered user-facing strings that may change between versions.
     */
    const isGenericFilesError = error.path.join('.') === 'files' && error.code === 'invalid_type';

    if (hasManuscriptError && isGenericFilesError) {
      return false; // Filter out the generic error
    }

    // Remove grants.0.grantId error only if we have a high-level grants validation error
    // that specifically relates to HHMI requirements (not general grant validation)
    const hasHHMISpecificError = allErrors.some(
      (e) =>
        e.path.join('.') === 'grants' &&
        (e.message === 'Select the HHMI Award recipient' ||
          e.message === 'HHMI grant must have a Grant ID'),
    );

    const isFirstGrantIdError =
      error.path.join('.') === 'grants.0.grantId' && error.message === 'Grant ID is required';

    // Only filter out grants.0.grantId if there's an HHMI-specific high-level error
    if (hasHHMISpecificError && isFirstGrantIdError) {
      return false; // Filter out the redundant grants.0.grantId error
    }

    return true;
  });

  // Improve grant error messages for subsequent grants (not grants.0)
  const improvedErrors = filteredErrors.map((error) => {
    const pathStr = error.path.join('.');

    // Match grants.n.grantId patterns where n > 0
    const grantIdMatch = pathStr.match(/^grants\.(\d+)\.grantId$/);
    if (grantIdMatch && error.message === 'Grant ID is required') {
      const grantIndex = parseInt(grantIdMatch[1], 10);

      // Only improve messages for grants beyond the first (index > 0)
      if (grantIndex > 0) {
        // Get the grant information from the metadata to find the funder
        const grantsForMessage = pmc?.grants || [];
        const grant = grantsForMessage[grantIndex];

        if (grant && grant.funderKey) {
          const funder = PMC_FUNDERS_MAP[grant.funderKey];
          const funderAbbrev = funder?.abbreviation || grant.funderKey.toUpperCase();
          const displayIndex = grantIndex + 1; // Convert to 1-indexed for user display

          return {
            ...error,
            message: `Grant ${displayIndex} - ${funderAbbrev} Grant ID is required`,
          };
        }
      }
    }

    return error;
  });

  // If we have any errors, return them all
  if (improvedErrors.length > 0) {
    return {
      error: {
        type: 'general',
        message: 'Validation failed',
        details: {
          issues: improvedErrors,
          name: 'ZodError',
        },
      },
      validationErrors: improvedErrors,
    };
  }

  return { success: true };
}
