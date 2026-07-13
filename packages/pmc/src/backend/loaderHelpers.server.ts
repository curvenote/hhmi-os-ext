import type {
  PMCWorkVersionMetadata,
  PMCCombinedMetadataSection,
  WorkVersionMetadataWithFilesAndPMC,
} from '../common/metadata.schema.js';
import { signPmcDisplayMetadata } from './metadata/utils.server.js';
import { PMC_MANUSCRIPT_SLOT } from '../common/fileMappings.js';
import type { WorkflowTransition } from '@curvenote/scms-core';

export type DepositSubmissionDetails = {
  id: string;
  date_created: string;
  date_modified: string;
  status: string;
  transition: WorkflowTransition | null;
  metadata: PMCCombinedMetadataSection;
  manuscriptFileName: string;
  slotCounts: Record<string, number>;
  submission: any;
  workVersion: any;
};

/**
 * Maps submission versions to enriched display objects that combine:
 * - Submission version data (status, metadata, etc.)
 * - Work version data (PMC form data, files, etc.)
 * - File information with signed URLs
 *
 * This function merges work version and submission version metadata,
 * with submission version data taking precedence for overlapping fields
 * except within the 'pmc' key where both are preserved.
 *
 * @param submissionVersionsRaw - Raw submission versions from database
 * @param ctx - Site context for file operations
 * @returns Array of enriched submission version objects ready for UI display
 */
export async function mapToDepositSubmissionDetails(
  submissionVersionsRaw: any[],
  ctx: any,
): Promise<DepositSubmissionDetails[]> {
  return Promise.all(
    submissionVersionsRaw.map(async (sv) => {
      let workVersionMetadata = sv.work_version.metadata || {};
      if (typeof workVersionMetadata === 'string') {
        try {
          workVersionMetadata = JSON.parse(workVersionMetadata) as PMCWorkVersionMetadata;
        } catch {
          workVersionMetadata = {};
        }
      }
      let submissionVersionMetadata = sv.metadata || {};
      if (typeof submissionVersionMetadata === 'string') {
        try {
          submissionVersionMetadata = JSON.parse(submissionVersionMetadata);
        } catch {
          submissionVersionMetadata = {};
        }
      }
      // Type guard for Data
      let files: WorkVersionMetadataWithFilesAndPMC['files'] = {};
      if (
        workVersionMetadata &&
        typeof workVersionMetadata === 'object' &&
        'files' in workVersionMetadata &&
        workVersionMetadata.files &&
        typeof workVersionMetadata.files === 'object'
      ) {
        files = (workVersionMetadata.files ?? {}) as WorkVersionMetadataWithFilesAndPMC['files'];
      }

      // Get signed file URLs using utility function
      const workVersion = sv.work_version;
      const cdn = workVersion.cdn ?? '';
      const metadataWithFiles = { ...workVersionMetadata, files };
      const signedMetadata = await signPmcDisplayMetadata(
        metadataWithFiles as WorkVersionMetadataWithFilesAndPMC,
        cdn,
        ctx,
      );
      const filesWithUrls = signedMetadata.files ?? {};

      // Manuscript file: first native or mapped pmc/manuscript entry
      const manuscriptFile = Object.values(filesWithUrls).find(
        (file: any) => file && file.slot === PMC_MANUSCRIPT_SLOT,
      );
      // Count files in each slot (excluding 'pmc/manuscript')
      const slotCounts: Record<string, number> = {};
      Object.values(filesWithUrls).forEach((file: any) => {
        if (file && file.slot !== PMC_MANUSCRIPT_SLOT) {
          slotCounts[file.slot] = (slotCounts[file.slot] || 0) + 1;
        }
      });

      return {
        id: sv.id,
        date_created: sv.date_created,
        date_modified: sv.date_modified,
        status: sv.status,
        transition: sv.transition,
        metadata: {
          ...(typeof workVersionMetadata === 'object' && workVersionMetadata !== null
            ? workVersionMetadata
            : {}),
          ...(typeof submissionVersionMetadata === 'object' && submissionVersionMetadata !== null
            ? submissionVersionMetadata
            : {}),
          pmc: {
            ...(workVersionMetadata?.pmc || {}),
            ...(submissionVersionMetadata?.pmc || {}),
          },
          files: filesWithUrls,
        },
        manuscriptFileName:
          manuscriptFile && typeof manuscriptFile === 'object' && 'name' in manuscriptFile
            ? manuscriptFile.name
            : '',
        slotCounts,
        submission: sv.submission,
        workVersion:
          typeof workVersion === 'object' && workVersion !== null
            ? {
                ...workVersion,
                metadata: {
                  ...(typeof workVersionMetadata === 'object' && workVersionMetadata !== null
                    ? workVersionMetadata
                    : {}),
                  files: filesWithUrls,
                },
              }
            : { metadata: { files: filesWithUrls } },
      };
    }),
  );
}
