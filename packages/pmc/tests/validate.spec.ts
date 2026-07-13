// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validatePMCMetadata, type PMCWorkVersionMetadata } from '../src/common/validate.js';

// Mock console.log to avoid test output noise from the schema
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

beforeEach(() => {
  consoleSpy.mockClear();
});

// Helper function to create valid base metadata
function createValidMetadata(
  overrides: Partial<PMCWorkVersionMetadata> = {},
): PMCWorkVersionMetadata {
  return {
    files: {
      'file1.pdf': {
        path: 'file1.pdf',
        name: 'file1.pdf',
        type: 'application/pdf',
        size: 1024,
        md5: 'abc123def456',
        uploadDate: '2023-01-01T00:00:00.000Z',
        slot: 'pmc/manuscript',
        label: 'Manuscript',
      },
    },
    pmc: {
      certifyManuscript: true,
      title: 'Test Article Title',
      journalName: 'Test Journal',
      grants: [
        {
          id: 'grant-1',
          funderKey: 'hhmi',
          grantId: 'HHMI-12345',
          investigatorName: 'John Doe',
        },
      ],
      ownerFirstName: 'John',
      ownerLastName: 'Doe',
      ownerEmail: 'john.doe@example.com',
      issn: '1234-5678',
      issnType: 'electronic',
    },
    ...overrides,
  } as PMCWorkVersionMetadata;
}

describe('validatePMCMetadata', () => {
  describe('Success cases', () => {
    it('should return success for valid metadata', async () => {
      const metadata = createValidMetadata();
      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.validationErrors).toBeUndefined();
    });

    it('should return success with valid HHMI grant', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'hhmi',
              grantId: 'HHMI-12345',
              investigatorName: 'Jane Smith',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);
      expect(result.success).toBe(true);
    });

    it('should return success with multiple grants including HHMI', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'hhmi',
              grantId: 'HHMI-12345',
            },
            {
              id: 'grant-2',
              funderKey: 'nih',
              grantId: 'NIH-67890',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);
      expect(result.success).toBe(true);
    });
  });

  describe('Files validation', () => {
    it('should fail when no files are provided', async () => {
      const metadata = createValidMetadata({ files: {} });
      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['files'],
          message: 'At least one manuscript file is required',
        }),
      );
    });

    it('should fail when no manuscript files are provided', async () => {
      const metadata = createValidMetadata({
        files: {
          'file1.pdf': {
            path: 'file1.pdf',
            name: 'file1.pdf',
            type: 'application/pdf',
            size: 1024,
            md5: 'abc123def456',
            uploadDate: '2023-01-01T00:00:00.000Z',
            slot: 'pmc/supplementary',
            label: 'Supplementary',
          },
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['files'],
          message: 'At least one manuscript file is required',
        }),
      );
    });

    it('should accept mapped article manuscript files without native pmc/manuscript entries', async () => {
      const metadata = createValidMetadata({
        files: {
          'cdn/manuscript/paper.docx': {
            path: 'cdn/manuscript/paper.docx',
            name: 'paper.docx',
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            size: 1024,
            md5: 'abc123def456',
            uploadDate: '2023-01-01T00:00:00.000Z',
            slot: 'manuscript',
            label: 'paper',
          },
        },
        pmc: {
          ...createValidMetadata().pmc,
          fileMappings: {
            'pmc/manuscript': [
              {
                id: 'map-1',
                targetSlot: 'pmc/manuscript',
                sourceMetadataKey: 'cdn/manuscript/paper.docx',
                sourcePath: 'cdn/manuscript/paper.docx',
                sourceSlot: 'manuscript',
                label: 'paper',
              },
            ],
          },
        },
      });

      const result = await validatePMCMetadata(metadata);
      expect(result.success).toBe(true);
    });

    it('should filter out generic files error when manuscript-specific error exists', async () => {
      const metadata = createValidMetadata({ files: undefined as any });
      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['files'],
          message: 'At least one manuscript file is required',
        }),
      );

      expect(result.validationErrors).not.toContainEqual(
        expect.objectContaining({
          path: ['files'],
          message: 'Required',
          code: 'invalid_type',
        }),
      );
    });
  });

  describe('PMC schema validation', () => {
    it('should fail when required fields are missing', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          title: '',
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['title'],
          message: 'Article title is required',
        }),
      );
    });

    it('should fail when email is invalid', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          ownerEmail: 'invalid-email',
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['ownerEmail'],
          message: 'Please enter a valid email address',
        }),
      );
    });

    it('should fail when certifyManuscript is false', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          certifyManuscript: false,
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['certifyManuscript'],
          message: expect.stringContaining('You must certify'),
        }),
      );
    });
  });

  describe('Grant validation', () => {
    it('should fail when no grants are provided', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants'],
          message: 'At least one grant is required',
        }),
      );
    });

    it('should fail when no HHMI grant is present', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'nih',
              grantId: 'NIH-12345',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants'],
          message: 'Select the HHMI Award recipient',
        }),
      );
    });

    it('should fail when HHMI grant has no grantId', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'hhmi',
              grantId: '',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants'],
          message: 'Select the HHMI Award recipient',
        }),
      );

      expect(result.validationErrors).not.toContainEqual(
        expect.objectContaining({
          path: ['grants', 0, 'grantId'],
          message: 'Grant ID is required',
        }),
      );
    });

    it('should fail when HHMI grant has undefined grantId', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'hhmi',
              grantId: undefined as any,
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants'],
          message: 'Select the HHMI Award recipient',
        }),
      );

      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants', 0, 'grantId'],
          message: 'Invalid input: expected string, received undefined',
        }),
      );
    });

    it('should fail when individual grant has missing grantId', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'hhmi',
              grantId: 'HHMI-12345',
            },
            {
              id: 'grant-2',
              funderKey: 'nih',
              grantId: '',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants', 1, 'grantId'],
          message: 'Grant 2 - NIH Grant ID is required',
        }),
      );
    });

    it('should fail with custom HHMI validation when only non-HHMI grants exist (user test case)', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'ahrq',
              grantId: '123',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants'],
          message: 'Select the HHMI Award recipient',
          code: 'custom',
        }),
      );
      expect(result.validationErrors).not.toContainEqual(
        expect.objectContaining({
          path: ['grants', 0, 'grantId'],
        }),
      );
    });

    it('should fail when HHMI grant has whitespace-only grantId', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'hhmi',
              grantId: '   ',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants'],
          message: 'Select the HHMI Award recipient',
          code: 'custom',
        }),
      );
    });

    it('should show custom HHMI validation errors regardless of schema validation failures', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          title: '',
          grants: [
            {
              id: 'grant-1',
              funderKey: 'cdc',
              grantId: 'CDC-123',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants'],
          message: 'Select the HHMI Award recipient',
          code: 'custom',
        }),
      );
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['title'],
          message: 'Article title is required',
        }),
      );
      expect(result.validationErrors).not.toContainEqual(
        expect.objectContaining({
          path: ['grants', 0, 'grantId'],
        }),
      );
    });
  });

  describe('Error filtering and transformation', () => {
    it('should show both schema and custom errors for HHMI with empty grantId', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'hhmi',
              grantId: '',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();

      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants'],
          message: 'Select the HHMI Award recipient',
          code: 'custom',
        }),
      );

      expect(result.validationErrors).not.toContainEqual(
        expect.objectContaining({
          path: ['grants', 0, 'grantId'],
          message: 'Grant ID is required',
        }),
      );
    });

    it('should improve error messages for subsequent grants', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'hhmi',
              grantId: 'HHMI-12345',
            },
            {
              id: 'grant-2',
              funderKey: 'nih',
              grantId: '',
            },
            {
              id: 'grant-3',
              funderKey: 'cdc',
              grantId: '',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();

      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants', 1, 'grantId'],
          message: 'Grant 2 - NIH Grant ID is required',
        }),
      );

      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants', 2, 'grantId'],
          message: 'Grant 3 - CDC Grant ID is required',
        }),
      );
    });

    it('should show HHMI high-level error for non-HHMI first grant', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'nih',
              grantId: '',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();

      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants'],
          message: 'Select the HHMI Award recipient',
        }),
      );

      expect(result.validationErrors).not.toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('Grant 1 -'),
        }),
      );
    });

    it('should handle unknown funder keys gracefully in error improvement', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          grants: [
            {
              id: 'grant-1',
              funderKey: 'hhmi',
              grantId: 'HHMI-12345',
            },
            {
              id: 'grant-2',
              funderKey: 'unknown_funder' as any,
              grantId: '',
            },
          ],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();

      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          path: ['grants', 1, 'grantId'],
          message: 'Grant 2 - UNKNOWN_FUNDER Grant ID is required',
        }),
      );
    });
  });

  describe('Complex validation scenarios', () => {
    it('should handle multiple validation errors correctly', async () => {
      const metadata = createValidMetadata({
        files: {},
        pmc: {
          ...createValidMetadata().pmc,
          title: '',
          ownerEmail: 'invalid-email',
          grants: [],
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.error?.type).toBe('general');
      expect(result.error?.message).toBe('Validation failed');
      expect(result.validationErrors?.length).toBeGreaterThan(1);

      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({ message: 'At least one manuscript file is required' }),
      );
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({ message: 'Article title is required' }),
      );
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({ message: 'Please enter a valid email address' }),
      );
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({ message: 'At least one grant is required' }),
      );
    });

    it('should preserve error structure and details', async () => {
      const metadata = createValidMetadata({
        pmc: {
          ...createValidMetadata().pmc,
          title: '',
        },
      });

      const result = await validatePMCMetadata(metadata);

      expect(result.success).toBeUndefined();
      expect(result.error).toEqual({
        type: 'general',
        message: 'Validation failed',
        details: {
          issues: result.validationErrors,
          name: 'ZodError',
        },
      });
    });
  });
});
