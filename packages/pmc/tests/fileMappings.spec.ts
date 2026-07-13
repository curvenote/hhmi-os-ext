import { describe, expect, it, vi } from 'vitest';
import {
  ARTICLE_MANUSCRIPT_SLOT,
  assertUniqueNativeFileLabel,
  DuplicateSlotLabelError,
  PMC_MANUSCRIPT_SLOT,
  augmentMetadataWithMappedFiles,
  buildManuscriptFileMappings,
  collectPmcDepositFiles,
  collectPmcManuscriptLabels,
  countPmcManuscriptFiles,
  isPmcManuscriptWordFile,
  mappingPathForId,
  mergeFileMappings,
  pruneExcludedSourcePaths,
  pruneStaleFileMappings,
} from '../src/common/fileMappings.js';

vi.mock('uuidv7', () => ({
  uuidv7: vi.fn(() => 'mapping-id-1'),
}));

describe('fileMappings', () => {
  const docxFile = {
    path: 'cdn-key/manuscript/paper.docx',
    name: 'paper.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 100,
    md5: 'abc',
    slot: ARTICLE_MANUSCRIPT_SLOT,
    label: 'paper',
  };

  const pdfFile = {
    path: 'cdn-key/manuscript/paper.pdf',
    name: 'paper.pdf',
    type: 'application/pdf',
    size: 100,
    md5: 'def',
    slot: ARTICLE_MANUSCRIPT_SLOT,
    label: 'paper_pdf',
  };

  it('accepts Word manuscripts only', () => {
    expect(isPmcManuscriptWordFile(docxFile)).toBe(true);
    expect(isPmcManuscriptWordFile(pdfFile)).toBe(false);
  });

  it('builds mappings from eligible manuscript files', () => {
    const files = {
      [docxFile.path]: docxFile,
      [pdfFile.path]: pdfFile,
    };
    const mappings = buildManuscriptFileMappings(files, undefined, new Set());
    expect(mappings[PMC_MANUSCRIPT_SLOT]).toHaveLength(1);
    expect(mappings[PMC_MANUSCRIPT_SLOT]?.[0].sourcePath).toBe(docxFile.path);
  });

  it('counts mapped manuscripts for validation', () => {
    const files = { [docxFile.path]: docxFile };
    const mappings = buildManuscriptFileMappings(files, undefined, new Set());
    expect(countPmcManuscriptFiles(files, mappings)).toBe(1);
    expect(countPmcManuscriptFiles(files, undefined)).toBe(0);
  });

  it('collects native pmc files and mapped sources for deposit', () => {
    const native = {
      path: 'cdn-key/pmc/native.docx',
      name: 'native.docx',
      type: docxFile.type,
      size: 50,
      md5: 'native',
      slot: PMC_MANUSCRIPT_SLOT,
      label: 'native',
    };
    const files = {
      [docxFile.path]: docxFile,
      [pdfFile.path]: pdfFile,
      [native.path]: native,
    };
    const mappings = buildManuscriptFileMappings(files, undefined, new Set());
    const depositFiles = collectPmcDepositFiles(files, mappings);

    expect(depositFiles).toHaveLength(2);
    expect(depositFiles.map((f) => f.path)).toEqual(
      expect.arrayContaining([native.path, docxFile.path]),
    );
    expect(depositFiles.find((f) => f.path === pdfFile.path)).toBeUndefined();
  });

  it('augments display metadata with synthetic mapping paths', () => {
    const files = { [docxFile.path]: docxFile };
    const mappings = buildManuscriptFileMappings(files, undefined, new Set());
    const mappingId = mappings[PMC_MANUSCRIPT_SLOT]![0].id;
    const augmented = augmentMetadataWithMappedFiles({
      files,
      pmc: { fileMappings: mappings },
    });

    expect(augmented.files?.[mappingPathForId(mappingId)]).toMatchObject({
      slot: PMC_MANUSCRIPT_SLOT,
      storagePath: docxFile.path,
      mappedFromSlot: ARTICLE_MANUSCRIPT_SLOT,
    });
  });

  it('prunes stale mappings when source files disappear', () => {
    const files = { [docxFile.path]: docxFile };
    const mappings = buildManuscriptFileMappings(files, undefined, new Set());
    const pruned = pruneStaleFileMappings({}, mappings);
    expect(pruned[PMC_MANUSCRIPT_SLOT]).toBeUndefined();
  });

  it('mergeFileMappings adds new manuscript docx and drops stale entries', () => {
    const files = { [docxFile.path]: docxFile };
    const staleMappings = {
      [PMC_MANUSCRIPT_SLOT]: [
        {
          id: 'stale',
          targetSlot: PMC_MANUSCRIPT_SLOT as typeof PMC_MANUSCRIPT_SLOT,
          sourceMetadataKey: 'missing',
          sourcePath: 'cdn-key/manuscript/removed.docx',
          sourceSlot: ARTICLE_MANUSCRIPT_SLOT,
        },
      ],
    };
    const merged = mergeFileMappings(files, staleMappings);
    expect(merged[PMC_MANUSCRIPT_SLOT]).toHaveLength(1);
    expect(merged[PMC_MANUSCRIPT_SLOT]?.[0].sourcePath).toBe(docxFile.path);
  });

  it('mergeFileMappings does not recreate user-excluded manuscript sources', () => {
    const files = { [docxFile.path]: docxFile };
    const merged = mergeFileMappings(files, undefined, [docxFile.path]);
    expect(merged[PMC_MANUSCRIPT_SLOT]).toBeUndefined();
  });

  it('pruneExcludedSourcePaths drops exclusions when source files disappear', () => {
    const pruned = pruneExcludedSourcePaths({}, [docxFile.path]);
    expect(pruned).toEqual([]);
  });

  it('collectPmcManuscriptLabels includes mapped labels and honors excludeNativePath', () => {
    const native = {
      path: 'cdn-key/pmc/native.docx',
      name: 'native.docx',
      type: docxFile.type,
      size: 50,
      md5: 'native',
      slot: PMC_MANUSCRIPT_SLOT,
      label: 'native_label',
    };
    const files = {
      [docxFile.path]: docxFile,
      [native.path]: native,
    };
    const mappings = buildManuscriptFileMappings(files, undefined, new Set());
    const labels = collectPmcManuscriptLabels(files, mappings[PMC_MANUSCRIPT_SLOT], {
      excludeNativePath: native.path,
    });

    expect(labels.has('native_label')).toBe(false);
    expect(labels.has(mappings[PMC_MANUSCRIPT_SLOT]![0].label!)).toBe(true);
  });

  it('assertUniqueNativeFileLabel rejects pmc/manuscript rename colliding with mapped label', () => {
    const native = {
      path: 'cdn-key/pmc/native.docx',
      name: 'native.docx',
      type: docxFile.type,
      size: 50,
      md5: 'native',
      slot: PMC_MANUSCRIPT_SLOT,
      label: 'native_label',
    };
    const files = {
      [docxFile.path]: docxFile,
      [native.path]: native,
    };
    const mappings = buildManuscriptFileMappings(files, undefined, new Set());
    const mappedLabel = mappings[PMC_MANUSCRIPT_SLOT]![0].label!;

    expect(() =>
      assertUniqueNativeFileLabel(native.path, mappedLabel, {
        files,
        pmc: { fileMappings: mappings },
      }),
    ).toThrow(DuplicateSlotLabelError);
  });

  it('assertUniqueNativeFileLabel no-ops when file metadata has no slot', () => {
    const sharedLabel = 'shared_unslotted_label';
    const unslotted = {
      path: 'cdn-key/pmc/unslotted-a.docx',
      name: 'unslotted-a.docx',
      type: docxFile.type,
      size: 50,
      md5: 'unslotted-a',
      label: 'unslotted_label',
    };
    const otherUnslotted = {
      path: 'cdn-key/pmc/unslotted-b.docx',
      name: 'unslotted-b.docx',
      type: docxFile.type,
      size: 50,
      md5: 'unslotted-b',
      label: sharedLabel,
    };
    const files = {
      [unslotted.path]: unslotted,
      [otherUnslotted.path]: otherUnslotted,
    };

    // Renaming to another unslotted file's label only passes because of the early return.
    expect(() =>
      assertUniqueNativeFileLabel(unslotted.path, sharedLabel, { files }),
    ).not.toThrow();
  });

  it('assertUniqueNativeFileLabel ignores mapped labels for non-pmc slots', () => {
    const supplement = {
      path: 'cdn-key/pmc/supplement.pdf',
      name: 'supplement.pdf',
      type: 'application/pdf',
      size: 50,
      md5: 'supp',
      slot: 'pmc/supplement',
      label: 'supplement_label',
    };
    const files = {
      [docxFile.path]: docxFile,
      [supplement.path]: supplement,
    };
    const mappings = buildManuscriptFileMappings(files, undefined, new Set());
    const mappedLabel = mappings[PMC_MANUSCRIPT_SLOT]![0].label!;

    expect(() =>
      assertUniqueNativeFileLabel(supplement.path, mappedLabel, {
        files,
        pmc: { fileMappings: mappings },
      }),
    ).not.toThrow();
  });
});
