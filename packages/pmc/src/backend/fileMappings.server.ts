import { safeWorkVersionJsonUpdate } from '@curvenote/scms-server';
import { coerceToObject } from '@curvenote/scms-core';
import type { FileMetadataSection } from '@curvenote/scms-core';
import {
  collectPmcManuscriptLabels,
  DuplicateSlotLabelError,
  isMappingPath,
  mappingIdFromPath,
  mergeFileMappings,
  pruneExcludedSourcePaths,
  type PmcFileMappings,
} from '../common/fileMappings.js';
import type { PMCWorkVersionMetadataSection } from '../common/metadata.schema.js';

type WorkVersionMetadataWithPmc = PMCWorkVersionMetadataSection &
  FileMetadataSection & {
    pmc?: PMCWorkVersionMetadataSection['pmc'] & {
      fileMappings?: PmcFileMappings;
      excludedManuscriptSourcePaths?: string[];
    };
  };

function applyFileMappingSync(
  readMetadata: WorkVersionMetadataWithPmc,
): WorkVersionMetadataWithPmc {
  const files = readMetadata.files ?? {};
  const existingMappings = readMetadata.pmc?.fileMappings;
  const excludedManuscriptSourcePaths = pruneExcludedSourcePaths(
    files,
    readMetadata.pmc?.excludedManuscriptSourcePaths,
  );
  const fileMappings = mergeFileMappings(files, existingMappings, excludedManuscriptSourcePaths);

  if (!readMetadata.pmc) {
    readMetadata.pmc = {};
  }

  if (Object.keys(fileMappings).length === 0) {
    delete readMetadata.pmc.fileMappings;
  } else {
    readMetadata.pmc.fileMappings = fileMappings;
  }

  if (excludedManuscriptSourcePaths.length === 0) {
    delete readMetadata.pmc.excludedManuscriptSourcePaths;
  } else {
    readMetadata.pmc.excludedManuscriptSourcePaths = excludedManuscriptSourcePaths;
  }

  return readMetadata;
}

export async function syncManuscriptFileMappings(workVersionId: string): Promise<void> {
  await safeWorkVersionJsonUpdate(workVersionId, (metadata) => {
    const readMetadata = coerceToObject(metadata) as WorkVersionMetadataWithPmc;
    return applyFileMappingSync(readMetadata) as any;
  });
}

export async function removeFileMapping(
  workVersionId: string,
  displayPath: string,
): Promise<{ success: true } | { error: string }> {
  const mappingId = mappingIdFromPath(displayPath);
  if (!mappingId) {
    return { error: 'Invalid mapped file path' };
  }

  await safeWorkVersionJsonUpdate(workVersionId, (metadata) => {
    const readMetadata = coerceToObject(metadata) as WorkVersionMetadataWithPmc;
    const mappings = readMetadata.pmc?.fileMappings?.['pmc/manuscript'] ?? [];
    const removed = mappings.find((m) => m.id === mappingId);
    const next = mappings.filter((m) => m.id !== mappingId);

    if (!readMetadata.pmc) return readMetadata as any;

    if (next.length === 0) {
      delete readMetadata.pmc.fileMappings;
    } else {
      readMetadata.pmc.fileMappings = { 'pmc/manuscript': next };
    }

    if (removed?.sourcePath) {
      // One-way tombstone: exclusion persists until the source file leaves the manuscript slot
      // (pruned on sync) or is re-uploaded under a new path. No deposit-UI restore action yet.
      const excluded = new Set(readMetadata.pmc.excludedManuscriptSourcePaths ?? []);
      excluded.add(removed.sourcePath);
      readMetadata.pmc.excludedManuscriptSourcePaths = [...excluded];
    }

    return readMetadata as any;
  });

  return { success: true };
}

export async function updateMappedFileLabel(
  workVersionId: string,
  displayPath: string,
  label: string,
): Promise<{ success: true } | { error: string }> {
  const mappingId = mappingIdFromPath(displayPath);
  if (!mappingId) {
    return { error: 'Invalid mapped file path' };
  }

  try {
    await safeWorkVersionJsonUpdate(workVersionId, (metadata) => {
      const readMetadata = coerceToObject(metadata) as WorkVersionMetadataWithPmc;
      const mappings = readMetadata.pmc?.fileMappings?.['pmc/manuscript'];
      if (!mappings) return readMetadata as any;

      const slotLabels = collectPmcManuscriptLabels(readMetadata.files, mappings, {
        excludeMappingId: mappingId,
      });
      if (slotLabels.has(label)) {
        throw new DuplicateSlotLabelError();
      }

      readMetadata.pmc = {
        ...readMetadata.pmc,
        fileMappings: {
          'pmc/manuscript': mappings.map((m) => (m.id === mappingId ? { ...m, label } : m)),
        },
      };

      return readMetadata as any;
    });
  } catch (error) {
    if (error instanceof DuplicateSlotLabelError) {
      return { error: error.message };
    }
    throw error;
  }

  return { success: true };
}

export function isMappedFileRemovePath(path: string): boolean {
  return isMappingPath(path);
}
