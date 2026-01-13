import { zfd } from 'zod-form-data';
import { withValidFormData } from '@curvenote/scms-server';
import { safelyPatchPMCMetadata } from './utils.server.js';
import { pmcMetadataSchema } from '../../common/metadata.schema.js';

// Extract field schemas from the main metadata schema and add transforms
const firstNameSchema = pmcMetadataSchema.shape.reviewerFirstName
  .unwrap()
  .transform((val) => (val === '' ? undefined : val));

const lastNameSchema = pmcMetadataSchema.shape.reviewerLastName
  .unwrap()
  .transform((val) => (val === '' ? undefined : val));

const emailSchema = pmcMetadataSchema.shape.reviewerEmail
  .unwrap()
  .transform((val) => (val === '' ? undefined : val));

const ReviewerNameSchema = zfd.formData({
  firstName: firstNameSchema,
});

const ReviewerLastNameSchema = zfd.formData({
  lastName: lastNameSchema,
});

const ReviewerEmailSchema = zfd.formData({
  email: zfd.text(emailSchema),
});

/**
 * Updates the reviewer's first name in PMC metadata.
 * @param formData - Form data containing the first name
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function updateReviewerFirstName(formData: FormData, workVersionId: string) {
  return withValidFormData(
    ReviewerNameSchema,
    formData,
    async ({ firstName }) => {
      return safelyPatchPMCMetadata(workVersionId, {
        reviewerFirstName: firstName,
      });
    },
    { errorFields: { type: 'general', intent: 'reviewer-first-name' } },
  );
}

/**
 * Updates the reviewer's last name in PMC metadata.
 * @param formData - Form data containing the last name
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function updateReviewerLastName(formData: FormData, workVersionId: string) {
  return withValidFormData(
    ReviewerLastNameSchema,
    formData,
    async ({ lastName }) => {
      return safelyPatchPMCMetadata(workVersionId, {
        reviewerLastName: lastName,
      });
    },
    { errorFields: { type: 'general', intent: 'reviewer-last-name' } },
  );
}

/**
 * Updates the reviewer's email in PMC metadata.
 * @param formData - Form data containing the email
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function updateReviewerEmail(formData: FormData, workVersionId: string) {
  return withValidFormData(
    ReviewerEmailSchema,
    formData,
    async ({ email }) => {
      return safelyPatchPMCMetadata(workVersionId, {
        reviewerEmail: email,
      });
    },
    { errorFields: { type: 'general', intent: 'reviewer-email' } },
  );
}

/**
 * Removes all reviewer information from PMC metadata.
 * @param formData - Form data (unused, kept for API consistency)
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function removeReviewer(formData: FormData, workVersionId: string) {
  return safelyPatchPMCMetadata(workVersionId, {
    reviewerFirstName: undefined,
    reviewerLastName: undefined,
    reviewerEmail: undefined,
    designateReviewer: false,
  });
}

/**
 * Updates the designate reviewer flag in PMC metadata.
 * @param formData - Form data containing the designateReviewer flag
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function updateDesignateReviewer(formData: FormData, workVersionId: string) {
  const designateReviewer = formData.get('designateReviewer') === 'true';
  return safelyPatchPMCMetadata(workVersionId, {
    designateReviewer,
  });
}
