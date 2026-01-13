import { zfd } from 'zod-form-data';
import { withValidFormData } from '@curvenote/scms-server';
import { safelyPatchPMCMetadata } from './utils.server.js';

const CertifySchema = zfd.formData({
  certify: zfd
    .checkbox({ trueValue: 'true' })
    .or(zfd.text().transform((value) => (value === 'false' ? false : undefined))),
});

/**
 * Updates the certify manuscript flag in PMC metadata.
 * @param formData - Form data containing the certify flag
 * @param workVersionId - The work version ID
 * @returns Success response or error response
 */
export async function updateCertifyManuscript(formData: FormData, workVersionId: string) {
  return withValidFormData(
    CertifySchema,
    formData,
    async ({ certify }) => {
      return safelyPatchPMCMetadata(workVersionId, {
        certifyManuscript: certify,
      });
    },
    { errorFields: { type: 'general', intent: 'certify-manuscript' } },
  );
}
