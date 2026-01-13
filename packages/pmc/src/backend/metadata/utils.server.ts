import {
  makeDefaultWorkVersionMetadata,
  safeWorkVersionJsonUpdate,
  StorageBackend,
  File,
  KnownBuckets,
  getPrismaClient,
} from '@curvenote/scms-server';
import type { FileMetadataSection, FileMetadataSectionItem } from '@curvenote/scms-core';
import { coerceToObject, ensureTrailingSlash } from '@curvenote/scms-core';
import type { PMCWorkVersionMetadata, DoiAuthor } from '../../common/metadata.schema.js';
import type { Context, WorkVersionMetadata } from '@curvenote/scms-server';
import { data } from 'react-router';

/**
 * Safely patches PMC metadata fields with optimistic concurrency control.
 * Also updates the WorkVersion title if the title field is being updated.
 * @param workVersionId - The work version ID
 * @param metadataPatch - Object containing metadata fields to update
 * @returns Success response or error response
 */
export async function safelyPatchPMCMetadata(
  workVersionId: string,
  metadataPatch: Record<string, any>,
) {
  try {
    const prisma = await getPrismaClient();

    // Check if we're updating the title field
    const isUpdatingTitle = 'title' in metadataPatch;

    // Update the metadata using the existing OCC mechanism
    await safeWorkVersionJsonUpdate<WorkVersionMetadata>(workVersionId, (metadata) => {
      const readMetadata = coerceToObject(metadata);

      const updatedMetadata: WorkVersionMetadata = {
        ...makeDefaultWorkVersionMetadata(),
        ...readMetadata,
      };

      Object.keys(metadataPatch).forEach((key) => {
        let value = metadataPatch[key];
        if (
          !Array.isArray(metadataPatch[key]) &&
          typeof metadataPatch[key] === 'object' &&
          metadataPatch[key] !== null
        ) {
          value = {
            ...updatedMetadata['pmc']?.[key],
            ...metadataPatch[key],
          };
        }
        updatedMetadata['pmc'] = { ...updatedMetadata['pmc'], [key]: value };
      });

      return updatedMetadata as any;
    });

    // If we updated the title, also update the WorkVersion title field immediately
    if (isUpdatingTitle) {
      await prisma.workVersion.update({
        where: { id: workVersionId },
        data: {
          title: metadataPatch.title || 'New PMC Deposit', // Use default title if title is cleared
          date_modified: new Date().toISOString(),
        },
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error(error);
    return data(
      {
        error: {
          type: 'general',
          error: 'Failed to update metadata',
          details: { workVersionId, error },
        },
      },
      { status: 500 },
    );
  }
}

/**
 * Safely updates PMC metadata using an update function with optimistic concurrency control.
 * Also updates the WorkVersion title if the title field changes.
 * @param workVersionId - The work version ID
 * @param updateFn - Function that takes current metadata and returns updated metadata
 * @returns Success response or error response
 */
export async function safelyUpdatePMCMetadata(
  workVersionId: string,
  updateFn: (metadata: PMCWorkVersionMetadata) => PMCWorkVersionMetadata,
) {
  try {
    const prisma = await getPrismaClient();

    // Store the original metadata to compare title changes
    let originalTitle: string | undefined;
    let newTitle: string | undefined;

    await safeWorkVersionJsonUpdate<WorkVersionMetadata>(workVersionId, (metadata) => {
      const readMetadata = coerceToObject(metadata);
      originalTitle = readMetadata['pmc']?.title;

      const updatedPMCMetadata = updateFn(readMetadata['pmc'] ?? {});
      newTitle = updatedPMCMetadata.title;

      const updatedMetadata: WorkVersionMetadata = {
        ...makeDefaultWorkVersionMetadata(),
        ...readMetadata,
        pmc: updatedPMCMetadata,
      };

      return updatedMetadata;
    });

    // If the title changed, also update the WorkVersion title field immediately
    if (originalTitle !== newTitle) {
      await prisma.workVersion.update({
        where: { id: workVersionId },
        data: {
          title: newTitle || 'New PMC Deposit', // Use default title if title is cleared
          date_modified: new Date().toISOString(),
        },
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error(error);
    return data(
      {
        error: {
          type: 'general',
          error: 'Failed to update metadata',
          details: { workVersionId, error },
        },
      },
      { status: 500 },
    );
  }
}

/**
 * Creates a description string from PMC metadata
 */
export function createPMCMetadataDescription(pmc: PMCWorkVersionMetadata): string {
  const parts = [
    `A PMC deposit of an AAM from the journal: "${pmc.journalName}", funded by ${pmc.funders?.join(', ') ?? 'None specified'}`,
    pmc.reviewerFirstName && pmc.reviewerLastName
      ? `Nominated reviewer for the PMC Deposit is: ${pmc.reviewerFirstName} ${pmc.reviewerLastName}`
      : null,
  ];
  return parts.filter(Boolean).join('. ');
}

/**
 * Compares two authors based on their sequence
 * @returns -1 if a should come before b, 1 if b should come before a, 0 if equal
 */
function compareAuthorSequence(a: DoiAuthor, b: DoiAuthor): number {
  // Both authors have sequence 'first' or neither do
  if ((a.sequence === 'first') === (b.sequence === 'first')) return 0;
  // Only a has sequence 'first'
  if (a.sequence === 'first') return -1;
  // Only b has sequence 'first'
  return 1;
}

/**
 * Formats a single author's name
 */
function formatAuthorName(author: DoiAuthor): string {
  const parts = [author.given, author.family].filter(Boolean);
  return parts.join(' ').trim();
}

/**
 * Formats authors from PMC metadata, sorting by sequence and formatting names
 */
export function formatPMCAuthors(pmc: PMCWorkVersionMetadata): string[] {
  // Handle case where we have DOI authors
  if (pmc.doiAuthors && Array.isArray(pmc.doiAuthors) && pmc.doiAuthors.length > 0) {
    return [...pmc.doiAuthors].sort(compareAuthorSequence).map(formatAuthorName).filter(Boolean); // Remove any empty strings
  }

  // Fallback to owner information
  if (pmc.ownerFirstName && pmc.ownerLastName) {
    return [`${pmc.ownerFirstName} ${pmc.ownerLastName}`];
  }

  // If we somehow have no valid authors, return empty array
  return [];
}

/**
 * Formats a single author from owner information
 */
export function formatOwnerAsAuthor(owner: { firstName: string; lastName: string }): string {
  return `${owner.firstName} ${owner.lastName}`;
}

/**
 * Returns a new metadata object with signedUrl added to each file in metadata.files
 * Does not mutate the input.
 */
export async function signFilesInMetadata(
  metadata: WorkVersionMetadata & FileMetadataSection,
  cdn: string,
  ctx: Context,
): Promise<WorkVersionMetadata & FileMetadataSection> {
  if (!metadata || typeof metadata !== 'object' || !metadata.files) return metadata;
  const backend = new StorageBackend(ctx, [KnownBuckets.prv, KnownBuckets.pub]);
  const isPrivateCdn = ctx.privateCdnUrls().has(ensureTrailingSlash(cdn));
  const filesWithSignedUrls: Record<string, FileMetadataSectionItem & { signedUrl: string }> = {};
  await Promise.all(
    Object.entries(metadata.files).map(async ([key, file]: [string, FileMetadataSectionItem]) => {
      const fileId = file.path;
      const bucket = isPrivateCdn ? KnownBuckets.prv : KnownBuckets.pub;
      const fileInstance = new File(backend, fileId, bucket);
      let signedUrl: string;
      if (isPrivateCdn) {
        signedUrl = await fileInstance.sign();
      } else {
        signedUrl = await fileInstance.url();
      }
      filesWithSignedUrls[key] = { ...file, signedUrl };
    }),
  );
  return { ...metadata, files: filesWithSignedUrls };
}
