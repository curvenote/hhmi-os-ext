import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARTICLE_MANUSCRIPT_SLOT,
  PMC_MANUSCRIPT_SLOT,
  mappingPathForId,
} from '../src/common/fileMappings.js';

const mockSafeWorkVersionJsonUpdate = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  safeWorkVersionJsonUpdate: (...args: unknown[]) => mockSafeWorkVersionJsonUpdate(...args),
}));

const {
  removeFileMapping,
  syncManuscriptFileMappings,
  updateMappedFileLabel,
} = await import('../src/backend/fileMappings.server.js');

describe('fileMappings.server', () => {
  const docxFile = {
    path: 'cdn-key/manuscript/paper.docx',
    name: 'paper.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 100,
    md5: 'abc',
    slot: ARTICLE_MANUSCRIPT_SLOT,
    label: 'paper',
  };

  const mapping = {
    id: 'mapping-1',
    targetSlot: PMC_MANUSCRIPT_SLOT as typeof PMC_MANUSCRIPT_SLOT,
    sourceMetadataKey: docxFile.path,
    sourcePath: docxFile.path,
    sourceSlot: ARTICLE_MANUSCRIPT_SLOT,
    label: 'paper',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeWorkVersionJsonUpdate.mockImplementation(
      async (_id: string, updater: (metadata: object) => object) => {
        const metadata = {
          files: { [docxFile.path]: docxFile },
          pmc: {
            fileMappings: { [PMC_MANUSCRIPT_SLOT]: [mapping] },
          },
        };
        return updater(metadata);
      },
    );
  });

  it('removeFileMapping records excluded source paths', async () => {
    const result = await removeFileMapping('wv-1', mappingPathForId(mapping.id));

    expect(result).toEqual({ success: true });
    const updater = mockSafeWorkVersionJsonUpdate.mock.calls[0][1] as (metadata: object) => {
      pmc?: { excludedManuscriptSourcePaths?: string[]; fileMappings?: object };
    };
    const updated = updater({
      files: { [docxFile.path]: docxFile },
      pmc: { fileMappings: { [PMC_MANUSCRIPT_SLOT]: [mapping] } },
    });

    expect(updated.pmc?.fileMappings).toBeUndefined();
    expect(updated.pmc?.excludedManuscriptSourcePaths).toEqual([docxFile.path]);
  });

  it('syncManuscriptFileMappings does not recreate excluded mappings', async () => {
    await syncManuscriptFileMappings('wv-1');

    const updater = mockSafeWorkVersionJsonUpdate.mock.calls[0][1] as (metadata: object) => {
      pmc?: { fileMappings?: Record<string, unknown[]> };
    };
    const updated = updater({
      files: { [docxFile.path]: docxFile },
      pmc: {
        excludedManuscriptSourcePaths: [docxFile.path],
      },
    });

    expect(updated.pmc?.fileMappings).toBeUndefined();
  });

  it('updateMappedFileLabel rejects duplicate labels in the slot', async () => {
    const native = {
      path: 'cdn-key/pmc/native.docx',
      name: 'native.docx',
      type: docxFile.type,
      size: 50,
      md5: 'native',
      slot: PMC_MANUSCRIPT_SLOT,
      label: 'taken',
    };

    mockSafeWorkVersionJsonUpdate.mockImplementation(
      async (_id: string, updater: (metadata: object) => object) => {
        return updater({
          files: { [native.path]: native },
          pmc: { fileMappings: { [PMC_MANUSCRIPT_SLOT]: [mapping] } },
        });
      },
    );

    const result = await updateMappedFileLabel('wv-1', mappingPathForId(mapping.id), 'taken');

    expect(result).toEqual({ error: 'Each label must be unique within this slot.' });
  });

  it('updateMappedFileLabel rethrows infrastructure failures', async () => {
    mockSafeWorkVersionJsonUpdate.mockRejectedValue(new Error('connection refused'));

    await expect(
      updateMappedFileLabel('wv-1', mappingPathForId(mapping.id), 'renamed'),
    ).rejects.toThrow('connection refused');
  });

  it('updateMappedFileLabel updates the mapping label when unique', async () => {
    const result = await updateMappedFileLabel('wv-1', mappingPathForId(mapping.id), 'renamed');

    expect(result).toEqual({ success: true });
    const updater = mockSafeWorkVersionJsonUpdate.mock.calls[0][1] as (metadata: object) => {
      pmc?: { fileMappings?: Record<string, Array<{ id: string; label?: string }>> };
    };
    const updated = updater({
      files: { [docxFile.path]: docxFile },
      pmc: { fileMappings: { [PMC_MANUSCRIPT_SLOT]: [mapping] } },
    });

    expect(updated.pmc?.fileMappings?.[PMC_MANUSCRIPT_SLOT]?.[0].label).toBe('renamed');
  });
});
