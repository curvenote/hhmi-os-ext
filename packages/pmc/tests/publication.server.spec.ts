// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDoiLookupPublicationMetadata,
  clearDoiLookupPublicationMetadataPatch,
  resetPublicationMetadata,
} from '../src/backend/metadata/publication.server.js';

const mockSafelyPatchPMCMetadata = vi.fn();

vi.mock('../src/backend/metadata/utils.server.js', () => ({
  safelyPatchPMCMetadata: (...args: unknown[]) => mockSafelyPatchPMCMetadata(...args),
}));

describe('publication metadata reset helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafelyPatchPMCMetadata.mockResolvedValue({ success: true });
  });

  it('clearDoiLookupPublicationMetadata clears DOI-derived fields only', async () => {
    await clearDoiLookupPublicationMetadata(new FormData(), 'work-version-1');

    expect(mockSafelyPatchPMCMetadata).toHaveBeenCalledWith('work-version-1', {
      ...clearDoiLookupPublicationMetadataPatch,
    });

    const patch = mockSafelyPatchPMCMetadata.mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('title');
    expect(patch).not.toHaveProperty('journalName');
    expect(patch.doiUrl).toBeUndefined();
    expect(patch.doiSuccess).toBeUndefined();
    expect(patch.doiPublishedDate).toBeUndefined();
    expect(patch.issn).toBeUndefined();
    expect(patch.issnType).toBeUndefined();
  });

  it('resetPublicationMetadata clears title, journal, and DOI-derived fields', async () => {
    await resetPublicationMetadata(new FormData(), 'work-version-1');

    expect(mockSafelyPatchPMCMetadata).toHaveBeenCalledWith('work-version-1', {
      title: undefined,
      journalName: undefined,
      ...clearDoiLookupPublicationMetadataPatch,
    });
  });
});
