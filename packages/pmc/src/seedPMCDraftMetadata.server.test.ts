// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { seedPMCDraftMetadataFromSource } from './seedPMCDraftMetadata.server.js';

describe('seedPMCDraftMetadataFromSource', () => {
  it('inherits files and resets pmc deposit flags', () => {
    const result = seedPMCDraftMetadataFromSource({
      files: { manuscript: { path: 'old-key/doc.pdf' } },
      pmc: {
        previewed: true,
        confirmed: true,
        journalName: 'Nature Methods',
        title: 'Example',
      },
      checks: { enabled: ['x'] },
    });

    expect(result.files).toEqual({ manuscript: { path: 'old-key/doc.pdf' } });
    expect(result.pmc).toEqual({
      previewed: false,
      confirmed: false,
      journalName: 'Nature Methods',
      title: 'Example',
    });
    expect(result.checks).toEqual({ enabled: [] });
  });
});
