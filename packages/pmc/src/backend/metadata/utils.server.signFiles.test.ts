// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnownBuckets } from '@curvenote/scms-server';

const mockResolveBucketForCdn = vi.fn();
const fileInstances: Array<{ path: string; bucket: KnownBuckets }> = [];

vi.mock('@curvenote/scms-server', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    resolveBucketForCdn: (...args: unknown[]) => mockResolveBucketForCdn(...args),
    StorageBackend: class {
      // no-op backend for unit tests
    },
    File: class {
      path: string;
      bucket: KnownBuckets;
      constructor(_backend: unknown, path: string, bucket: KnownBuckets) {
        this.path = path;
        this.bucket = bucket;
        fileInstances.push({ path, bucket });
      }
      async sign() {
        return `signed://${this.bucket}/${this.path}`;
      }
      async url() {
        return `public://${this.bucket}/${this.path}`;
      }
    },
  };
});

const { signFilesInMetadata } = await import('./utils.server.js');

describe('signFilesInMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileInstances.length = 0;
  });

  it('uses resolveBucketForCdn so local MinIO private CDN signs from prv', async () => {
    mockResolveBucketForCdn.mockReturnValue(KnownBuckets.prv);
    const ctx = { privateCdnUrls: () => new Set(['https://prv.curvenote.dev/']) } as never;
    const cdn = 'http://127.0.0.1:9000/cdn-private-curvenote-dev-1/';

    const result = await signFilesInMetadata(
      {
        files: {
          'pmc/manuscript.docx': {
            path: 'work-1/pmc/manuscript.docx',
            content_type: 'application/octet-stream',
            size: 1,
            md5: 'abc',
            date_modified: '2026-01-01',
          },
        },
      } as never,
      cdn,
      ctx,
    );

    expect(mockResolveBucketForCdn).toHaveBeenCalled();
    expect(fileInstances).toEqual([
      { path: 'work-1/pmc/manuscript.docx', bucket: KnownBuckets.prv },
    ]);
    expect(result.files?.['pmc/manuscript.docx']?.signedUrl).toBe(
      'signed://prv/work-1/pmc/manuscript.docx',
    );
  });

  it('prefers storagePath when present', async () => {
    mockResolveBucketForCdn.mockReturnValue(KnownBuckets.prv);
    const ctx = { privateCdnUrls: () => new Set() } as never;

    await signFilesInMetadata(
      {
        files: {
          mapped: {
            path: 'display/path.docx',
            storagePath: 'work-1/pmc/real.docx',
            content_type: 'application/octet-stream',
            size: 1,
            md5: 'abc',
            date_modified: '2026-01-01',
          },
        },
      } as never,
      'http://127.0.0.1:9000/cdn-private-curvenote-dev-1/',
      ctx,
    );

    expect(fileInstances[0]?.path).toBe('work-1/pmc/real.docx');
  });
});
