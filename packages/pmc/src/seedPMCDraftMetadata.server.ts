import {
  baseSeedDraftMetadataFromSource,
  type SeedDraftMetadataFromSource,
} from '@curvenote/scms-server';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * PMC new-version clone: full metadata inheritance with deposit workflow flags reset.
 */
export const seedPMCDraftMetadataFromSource: SeedDraftMetadataFromSource = (sourceMetadata) => {
  const next = baseSeedDraftMetadataFromSource(sourceMetadata);

  if (isPlainObject(next.pmc)) {
    next.pmc = {
      ...next.pmc,
      previewed: false,
      confirmed: false,
    };
  }

  return next;
};
