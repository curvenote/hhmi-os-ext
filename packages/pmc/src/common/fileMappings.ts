import type { FileMetadataSection, FileMetadataSectionItem } from '@curvenote/scms-core';
import { generateUniqueFileLabel } from '@curvenote/scms-core';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { FILE_UPLOAD_CONFIGURATION } from './fileUploadConfiguration.js';
import type { WorkVersionMetadataWithFilesAndPMC } from './metadata.schema.js';

export const PMC_MANUSCRIPT_SLOT = 'pmc/manuscript';
export const ARTICLE_MANUSCRIPT_SLOT = 'manuscript';
export const PMC_MAPPING_PATH_PREFIX = 'pmc-mapping:';

export const DUPLICATE_SLOT_LABEL_MESSAGE = 'Each label must be unique within this slot.';

export class DuplicateSlotLabelError extends Error {
  constructor() {
    super(DUPLICATE_SLOT_LABEL_MESSAGE);
    this.name = 'DuplicateSlotLabelError';
  }
}

export const pmcFileMappingEntrySchema = z.object({
  id: z.string().min(1),
  targetSlot: z.literal(PMC_MANUSCRIPT_SLOT),
  sourceMetadataKey: z.string().min(1),
  sourcePath: z.string().min(1),
  sourceSlot: z.string().min(1),
  label: z.string().optional(),
});

export type PmcFileMappingEntry = z.infer<typeof pmcFileMappingEntrySchema>;

export type PmcFileMappings = Partial<Record<typeof PMC_MANUSCRIPT_SLOT, PmcFileMappingEntry[]>>;

export type PmcFileMetadataSection = FileMetadataSection & {
  files?: Record<
    string,
    FileMetadataSectionItem & {
      /** Display-only: storage path used when signing URLs for mapped files */
      storagePath?: string;
      /** Display-only: indicates this entry is derived from a work upload mapping */
      mappedFromSlot?: string;
    }
  >;
};

const PMC_MANUSCRIPT_MIME_TYPES = new Set(
  FILE_UPLOAD_CONFIGURATION[PMC_MANUSCRIPT_SLOT].mimeTypes ?? [],
);

export function isMappingPath(path: string): boolean {
  return path.startsWith(PMC_MAPPING_PATH_PREFIX);
}

export function mappingPathForId(mappingId: string): string {
  return `${PMC_MAPPING_PATH_PREFIX}${mappingId}`;
}

export function mappingIdFromPath(path: string): string | null {
  if (!isMappingPath(path)) return null;
  return path.slice(PMC_MAPPING_PATH_PREFIX.length);
}

/** PMC manuscript accepts Word only — PDFs and other formats are excluded. */
export function isPmcManuscriptWordFile(file: FileMetadataSectionItem): boolean {
  const mime = file.type?.toLowerCase();
  if (mime && PMC_MANUSCRIPT_MIME_TYPES.has(mime)) {
    return true;
  }
  const name = file.name?.toLowerCase() ?? file.path?.split('/').pop()?.toLowerCase() ?? '';
  return name.endsWith('.doc') || name.endsWith('.docx');
}

function manuscriptWordFiles(
  files: Record<string, FileMetadataSectionItem> | undefined,
): Array<[string, FileMetadataSectionItem]> {
  if (!files) return [];
  return Object.entries(files).filter(
    ([, file]) => file.slot === ARTICLE_MANUSCRIPT_SLOT && isPmcManuscriptWordFile(file),
  );
}

/**
 * Build manuscript → pmc/manuscript mappings from eligible article upload files.
 * Preserves existing mapping ids/labels when sourcePath matches.
 */
export function pruneExcludedSourcePaths(
  files: Record<string, FileMetadataSectionItem> | undefined,
  excludedSourcePaths: string[] | undefined,
): string[] {
  if (!excludedSourcePaths?.length) return [];
  const eligiblePaths = new Set(manuscriptWordFiles(files).map(([, f]) => f.path));
  return excludedSourcePaths.filter((path) => eligiblePaths.has(path));
}

export function buildManuscriptFileMappings(
  files: Record<string, FileMetadataSectionItem> | undefined,
  existingMappings: PmcFileMappings | undefined,
  existingLabels: Set<string>,
  excludedSourcePaths?: string[],
): PmcFileMappings {
  const previous = existingMappings?.[PMC_MANUSCRIPT_SLOT] ?? [];
  const bySourcePath = new Map(previous.map((m) => [m.sourcePath, m]));
  const excluded = new Set(excludedSourcePaths ?? []);
  const next: PmcFileMappingEntry[] = [];

  for (const [sourceMetadataKey, file] of manuscriptWordFiles(files)) {
    const sourcePath = file.path;
    if (excluded.has(sourcePath)) continue;

    const preserved = bySourcePath.get(sourcePath);
    if (preserved) {
      next.push(preserved);
      if (preserved.label) existingLabels.add(preserved.label);
      continue;
    }

    const filename = file.name ?? sourcePath.split('/').pop() ?? 'manuscript';
    const label = generateUniqueFileLabel(filename, existingLabels);
    existingLabels.add(label);

    next.push({
      id: uuidv7(),
      targetSlot: PMC_MANUSCRIPT_SLOT,
      sourceMetadataKey,
      sourcePath,
      sourceSlot: ARTICLE_MANUSCRIPT_SLOT,
      label,
    });
  }

  return next.length > 0 ? { [PMC_MANUSCRIPT_SLOT]: next } : {};
}

/** Drop mappings whose source file is missing or no longer an eligible Word manuscript. */
export function pruneStaleFileMappings(
  files: Record<string, FileMetadataSectionItem> | undefined,
  mappings: PmcFileMappings | undefined,
): PmcFileMappings {
  const manuscriptEntries = manuscriptWordFiles(files);
  const eligibleByPath = new Map(manuscriptEntries.map(([, f]) => [f.path, f]));
  const eligibleByKey = new Map(manuscriptEntries);

  const pruned = (mappings?.[PMC_MANUSCRIPT_SLOT] ?? []).filter((mapping) => {
    const byPath = eligibleByPath.get(mapping.sourcePath);
    if (byPath) return true;
    const byKey = eligibleByKey.get(mapping.sourceMetadataKey);
    return Boolean(byKey && isPmcManuscriptWordFile(byKey));
  });

  return pruned.length > 0 ? { [PMC_MANUSCRIPT_SLOT]: pruned } : {};
}

export function mergeFileMappings(
  files: Record<string, FileMetadataSectionItem> | undefined,
  existingMappings: PmcFileMappings | undefined,
  excludedSourcePaths?: string[],
): PmcFileMappings {
  const existingLabels = new Set<string>();
  for (const file of Object.values(files ?? {})) {
    if (file.label) existingLabels.add(file.label);
  }
  for (const mapping of existingMappings?.[PMC_MANUSCRIPT_SLOT] ?? []) {
    if (mapping.label) existingLabels.add(mapping.label);
  }

  const pruned = pruneStaleFileMappings(files, existingMappings);
  const excluded = pruneExcludedSourcePaths(files, excludedSourcePaths);
  return buildManuscriptFileMappings(files, pruned, existingLabels, excluded);
}

/** Labels already used in the pmc/manuscript slot (native uploads and mappings). */
export function collectPmcManuscriptLabels(
  files: Record<string, FileMetadataSectionItem> | undefined,
  mappings: PmcFileMappingEntry[] | undefined,
  options?: { excludeMappingId?: string; excludeNativePath?: string },
): Set<string> {
  const labels = new Set<string>();
  for (const file of Object.values(files ?? {})) {
    if (
      file.slot === PMC_MANUSCRIPT_SLOT &&
      file.path !== options?.excludeNativePath &&
      file.label
    ) {
      labels.add(file.label);
    }
  }
  for (const mapping of mappings ?? []) {
    if (mapping.id !== options?.excludeMappingId && mapping.label) {
      labels.add(mapping.label);
    }
  }
  return labels;
}

/** Enforce slot label uniqueness for native file edits (pmc/manuscript includes mapped labels). */
export function assertUniqueNativeFileLabel(
  path: string,
  label: string,
  metadata: {
    files?: Record<string, FileMetadataSectionItem>;
    pmc?: { fileMappings?: PmcFileMappings };
  },
): void {
  const files = metadata.files;
  const file = files?.[path];
  if (!file) return;

  const slot = file.slot;
  if (!slot) return;

  if (slot === PMC_MANUSCRIPT_SLOT) {
    const slotLabels = collectPmcManuscriptLabels(
      files,
      metadata.pmc?.fileMappings?.[PMC_MANUSCRIPT_SLOT],
      { excludeNativePath: path },
    );
    if (slotLabels.has(label)) {
      throw new DuplicateSlotLabelError();
    }
    return;
  }

  const slotLabels = Object.values(files)
    .filter((f) => f.slot === slot && f.path !== path)
    .map((f) => f.label)
    .filter(Boolean);
  if (slotLabels.includes(label)) {
    throw new DuplicateSlotLabelError();
  }
}

export function resolveMappingSourceFile(
  files: Record<string, FileMetadataSectionItem> | undefined,
  mapping: PmcFileMappingEntry,
): FileMetadataSectionItem | undefined {
  if (!files) return undefined;
  const byKey = files[mapping.sourceMetadataKey];
  if (byKey && isPmcManuscriptWordFile(byKey)) return byKey;
  const byPath = Object.values(files).find((f) => f.path === mapping.sourcePath);
  if (byPath && isPmcManuscriptWordFile(byPath)) return byPath;
  return undefined;
}

export type PmcDepositFile = FileMetadataSectionItem & { slot: string };

/** Files included in PMC deposit manifest: native pmc/* slots plus resolved mappings. */
export function collectPmcDepositFiles(
  files: Record<string, FileMetadataSectionItem> | undefined,
  mappings: PmcFileMappings | undefined,
): PmcDepositFile[] {
  const depositFiles: PmcDepositFile[] = [];

  for (const file of Object.values(files ?? {})) {
    if (file.slot?.startsWith('pmc/')) {
      depositFiles.push(file as PmcDepositFile);
    }
  }

  for (const mapping of mappings?.[PMC_MANUSCRIPT_SLOT] ?? []) {
    const source = resolveMappingSourceFile(files, mapping);
    if (!source) continue;

    const alreadyNative = depositFiles.some((f) => f.path === source.path || f.md5 === source.md5);
    if (alreadyNative) continue;

    depositFiles.push({
      ...source,
      slot: mapping.targetSlot,
      label: mapping.label ?? source.label,
      path: source.path,
    });
  }

  return depositFiles;
}

export function countPmcManuscriptFiles(
  files: Record<string, FileMetadataSectionItem> | undefined,
  mappings: PmcFileMappings | undefined,
): number {
  return collectPmcDepositFiles(files, mappings).filter((f) => f.slot === PMC_MANUSCRIPT_SLOT)
    .length;
}

/** Augment metadata.files with display entries for mapped sources (not persisted). */
export function augmentMetadataWithMappedFiles(
  metadata: WorkVersionMetadataWithFilesAndPMC,
): PmcFileMetadataSection & WorkVersionMetadataWithFilesAndPMC {
  const files: NonNullable<PmcFileMetadataSection['files']> = { ...(metadata.files ?? {}) };
  const mappings = metadata.pmc?.fileMappings;

  for (const mapping of mappings?.[PMC_MANUSCRIPT_SLOT] ?? []) {
    const source = resolveMappingSourceFile(files, mapping);
    if (!source) continue;

    const displayPath = mappingPathForId(mapping.id);
    if (files[displayPath]) continue;

    files[displayPath] = {
      ...source,
      slot: mapping.targetSlot,
      path: displayPath,
      storagePath: source.path,
      mappedFromSlot: mapping.sourceSlot,
      label: mapping.label ?? source.label,
    };
  }

  return { ...metadata, files };
}
