// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetConfig = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getConfig: mockGetConfig,
  fetchRecordsByFieldValue: vi.fn(),
}));

const {
  getAirtableApiKey,
  getAirtablePmcSubmissionsTableId,
  getAirtableScientistsFirstNamePreferredFieldId,
} = await import('./airtable-config.server.js');

describe('PMC Airtable configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockResolvedValue({
      app: {
        extensions: {
          pmc: {
            airtable: {
              apiKey: 'api-key',
              baseId: 'base-id',
              tables: {
                pmcSubmissions: {
                  id: 'submissions-table',
                  fields: { nihmsId: 'nihms-id-field' },
                },
                scientists: {
                  id: 'scientists-table',
                  fields: {
                    grantId: 'grant-id-field',
                    orcid: 'orcid-field',
                    fullName: 'full-name-field',
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('allows shared and PMC submission getters when new scientist fields are absent', async () => {
    await expect(getAirtableApiKey()).resolves.toBe('api-key');
    await expect(getAirtablePmcSubmissionsTableId()).resolves.toBe('submissions-table');
  });

  it('reports a missing new scientist field from its own getter', async () => {
    await expect(getAirtableScientistsFirstNamePreferredFieldId()).rejects.toThrow(
      'PMC Airtable scientists first name (preferred) field ID is missing',
    );
  });
});
