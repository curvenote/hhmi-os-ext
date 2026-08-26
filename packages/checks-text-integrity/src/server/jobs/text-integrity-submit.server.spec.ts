// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { textIntegritySubmitHandler } from './text-integrity-submit.server.js';
import { EULA_ADMIN_RETRY_SKIP_MESSAGE } from '../eula.server.js';

const mockFindUnique = vi.fn();
const mockLinkedJobCreate = vi.fn();
const mockDbStartJob = vi.fn();
const mockDbUpdateJob = vi.fn();
const mockMarkNoAutoRetry = vi.fn();
const mockPatchServiceData = vi.fn();
const mockAssertOriginal = vi.fn();
const mockRefreshEulaCacheIfStale = vi.fn();
const mockResolveEulaMsg = vi.fn();
const mockGetConfigOverrides = vi.fn();
const mockSignFiles = vi.fn();
const mockFetch = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    workVersion: { findUnique: mockFindUnique },
    checkServiceRun: { findUnique: mockFindUnique },
    user: { findUnique: mockFindUnique },
    linkedJob: { create: mockLinkedJobCreate },
  })),
  jobs: {
    dbStartJob: (...args: unknown[]) => mockDbStartJob(...args),
    dbUpdateJob: (...args: unknown[]) => mockDbUpdateJob(...args),
  },
  hooksNotifyBaseUrl: vi.fn((_path: string, base?: string) => base ?? 'http://notify.test'),
  signFilesInMetadata: (...args: unknown[]) => mockSignFiles(...args),
}));

vi.mock('../checkRunColumns.server.js', () => ({
  markCheckServiceRunNoAutoRetry: (...args: unknown[]) => mockMarkNoAutoRetry(...args),
  patchTextIntegrityRunServiceData: (...args: unknown[]) => mockPatchServiceData(...args),
}));

vi.mock('../config.server.js', () => ({
  getTextIntegrityConfigWithOverrides: (...args: unknown[]) => mockGetConfigOverrides(...args),
}));

vi.mock('../eula.server.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    assertOriginalSubmitterEulaCurrent: (...args: unknown[]) => mockAssertOriginal(...args),
    refreshEulaCacheIfStale: (...args: unknown[]) => mockRefreshEulaCacheIfStale(...args),
    resolveEulaSubmitFailureMessage: (...args: unknown[]) => mockResolveEulaMsg(...args),
    buildUploadEulaMetadata: vi.fn(() => undefined),
    isEulaRequired: vi.fn(() => true),
  };
});

const ctx = {
  user: { id: 'submitter-1' },
  $config: {
    app: {
      checks: {
        relayBaseUrl: 'https://relay.test',
        relayApiKey: 'relay-key',
      },
      extensions: { 'checks-text-integrity': { serviceName: 'ithenticate' } },
    },
  },
} as Parameters<typeof textIntegritySubmitHandler>[0];

const WORK_VERSION_ID = '00000000-0000-4000-8000-000000000001';

const workVersionRow = {
  id: WORK_VERSION_ID,
  title: 'Manuscript',
  cdn: 'cdn-bucket',
  metadata: {
    files: {
      manuscript: {
        signedUrl: 'https://cdn.example/manuscript.pdf',
        name: 'manuscript.pdf',
        type: 'application/pdf',
      },
    },
  },
};

const jobData = {
  job_id: 'job-1',
  job_type: 'TEXT_INTEGRITY_SUBMIT',
  payload: {
    work_version_id: WORK_VERSION_ID,
    check_service_run_id: 'run-1',
  },
  invoked_by_id: 'service-account',
};

function setupPrismaFindUnique() {
  mockFindUnique.mockImplementation(async (args: { where: { id: string } }) => {
    if (args.where.id === WORK_VERSION_ID) return workVersionRow;
    if (args.where.id === 'run-1') return { created_by_id: 'submitter-1' };
    if (args.where.id === 'submitter-1') {
      return { id: 'submitter-1', email: 'a@test.com', display_name: 'Author' };
    }
    return null;
  });
}

describe('textIntegritySubmitHandler EULA no_auto_retry', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFindUnique.mockReset();
    mockLinkedJobCreate.mockReset();
    mockDbStartJob.mockReset();
    mockDbUpdateJob.mockReset();
    mockMarkNoAutoRetry.mockReset();
    mockPatchServiceData.mockReset();
    mockAssertOriginal.mockReset();
    mockRefreshEulaCacheIfStale.mockReset();
    mockResolveEulaMsg.mockReset();
    mockGetConfigOverrides.mockReset();
    mockSignFiles.mockReset();
    mockFetch.mockReset();

    setupPrismaFindUnique();
    mockLinkedJobCreate.mockResolvedValue({});
    mockDbStartJob.mockResolvedValue({ id: 'job-1', date_created: '2026-01-01T00:00:00.000Z' });
    mockDbUpdateJob.mockResolvedValue({ id: 'job-1', status: 'COMPLETED' });
    mockMarkNoAutoRetry.mockResolvedValue(undefined);
    mockPatchServiceData.mockResolvedValue(undefined);
    mockGetConfigOverrides.mockResolvedValue({
      serviceName: 'ithenticate',
      relayInstanceId: 'default',
      notifyBaseUrl: 'http://localhost:3031/v1/hooks/text-integrity/notify',
    });
    mockRefreshEulaCacheIfStale.mockResolvedValue(undefined);
    mockSignFiles.mockImplementation(async (metadata) => metadata);
  });

  it('marks no_auto_retry when pre-submit EULA check fails', async () => {
    mockAssertOriginal.mockResolvedValue({
      ok: false,
      message: EULA_ADMIN_RETRY_SKIP_MESSAGE,
    });

    await expect(textIntegritySubmitHandler(ctx, jobData as never)).rejects.toBeInstanceOf(
      Response,
    );

    expect(mockMarkNoAutoRetry).toHaveBeenCalledWith('run-1');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('marks no_auto_retry when relay rejects for EULA not accepted', async () => {
    mockAssertOriginal.mockResolvedValue({ ok: true });
    mockResolveEulaMsg.mockResolvedValue('Turnitin EULA not accepted');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 451,
      text: async () =>
        JSON.stringify({
          status: 'error',
          result: { code: 'EULA_NOT_ACCEPTED', statusCode: 451 },
        }),
    });

    await expect(textIntegritySubmitHandler(ctx, jobData as never)).rejects.toBeInstanceOf(
      Response,
    );

    expect(mockMarkNoAutoRetry).toHaveBeenCalledWith('run-1');
    expect(mockFetch).toHaveBeenCalled();
  });
});
