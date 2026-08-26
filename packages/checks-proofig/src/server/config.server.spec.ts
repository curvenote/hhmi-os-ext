// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi } from 'vitest';
import { getProofigConfigWithOverrides, PROOFIG_CONFIG_OBJECT_TYPE } from './config.server.js';

describe('getProofigConfigWithOverrides', () => {
  it('returns base config when no object row exists', async () => {
    const base = { apiBaseUrl: 'https://default.example.com' };
    const prisma = {
      object: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as any;
    const result = await getProofigConfigWithOverrides(base, prisma);
    expect(result).toEqual({ ...base });
    expect(prisma.object.findFirst).toHaveBeenCalledWith({
      where: { type: PROOFIG_CONFIG_OBJECT_TYPE },
      orderBy: { date_modified: 'desc' },
      select: { data: true },
    });
  });

  it('returns base config when object data is null or not an object', async () => {
    const base = { apiBaseUrl: 'https://default.example.com' };
    const prisma = {
      object: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ data: null })
          .mockResolvedValueOnce({ data: 'string' })
          .mockResolvedValueOnce({}),
      },
    } as any;
    expect(await getProofigConfigWithOverrides(base, prisma)).toEqual({ ...base });
    expect(await getProofigConfigWithOverrides(base, prisma)).toEqual({ ...base });
    expect(await getProofigConfigWithOverrides(base, prisma)).toEqual({ ...base });
  });

  it('merges overlay apiBaseUrl, clientId, clientSecret onto base when object exists', async () => {
    const base = {
      apiBaseUrl: 'https://default.example.com',
      clientId: 'default-id',
    };
    const overlay = {
      apiBaseUrl: 'https://override.example.com',
      clientSecret: 'override-secret',
    };
    const prisma = {
      object: {
        findFirst: vi.fn().mockResolvedValue({ data: overlay }),
      },
    } as any;
    const result = await getProofigConfigWithOverrides(base, prisma);
    expect(result.apiBaseUrl).toBe('https://override.example.com');
    expect(result.clientId).toBe('default-id');
    expect(result.clientSecret).toBe('override-secret');
  });

  it('ignores non-string overlay values', async () => {
    const base = { apiBaseUrl: 'https://default.example.com' };
    const prisma = {
      object: {
        findFirst: vi.fn().mockResolvedValue({
          data: {
            apiBaseUrl: 123,
            clientId: null,
            clientSecret: '',
          },
        }),
      },
    } as any;
    const result = await getProofigConfigWithOverrides(base, prisma);
    expect(result.apiBaseUrl).toBe('https://default.example.com');
    expect(result.clientId).toBeUndefined();
    expect(result.clientSecret).toBe('');
  });
});
