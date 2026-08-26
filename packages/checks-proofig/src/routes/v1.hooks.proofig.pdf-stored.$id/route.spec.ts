// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROOFIG_PERSIST_PDF } from '../../server/jobs/proofigPersistPdf.constants.js';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  verifyHandshakeToken: vi.fn(),
  getPrismaClient: vi.fn(),
  patchProofigRunServiceData: vi.fn(),
  enqueueProofigPersistPdfFollowUpIfNeeded: vi.fn(),
}));

vi.mock('@curvenote/scms-server', () => ({
  getConfig: (...args: unknown[]) => mocks.getConfig(...args),
  verifyHandshakeToken: (...args: unknown[]) => mocks.verifyHandshakeToken(...args),
  getPrismaClient: (...args: unknown[]) => mocks.getPrismaClient(...args),
}));

vi.mock('../../server/checkRunColumns.server.js', () => ({
  patchProofigRunServiceData: (...args: unknown[]) => mocks.patchProofigRunServiceData(...args),
}));

vi.mock('../../server/enqueue-proofig-persist-pdf.server.js', () => ({
  enqueueProofigPersistPdfFollowUpIfNeeded: (...args: unknown[]) =>
    mocks.enqueueProofigPersistPdfFollowUpIfNeeded(...args),
}));

import { action } from './route.js';

const RUN_ID = 'run-1';
const WV_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = 'job-1';
const CDN_KEY = 'wv-cdn-key';
const ABS_PATH = `${CDN_KEY}/generated/${RUN_ID}/proofig-report.pdf`;

function makeArgs(init: {
  id?: string;
  auth?: string | null;
  body?: unknown;
}): Parameters<typeof action>[0] {
  const headers = new Headers();
  if (init.auth !== null && init.auth !== undefined) {
    headers.set('authorization', init.auth);
  } else if (init.auth === undefined) {
    headers.set('authorization', 'Bearer token-1');
  }
  return {
    params: { id: init.id ?? RUN_ID },
    request: new Request(`http://localhost/hooks/proofig/pdf-stored/${RUN_ID}`, {
      method: 'POST',
      headers,
      body: init.body === undefined ? JSON.stringify(validBody()) : JSON.stringify(init.body),
    }),
  } as unknown as Parameters<typeof action>[0];
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    work_version_id: WV_ID,
    report_id: 'report-1',
    path: ABS_PATH,
    size: 12,
    md5: 'abc',
    ...overrides,
  };
}

async function expectResponseStatus(fn: () => Promise<unknown>, status: number) {
  try {
    await fn();
    expect.fail('expected a thrown Response');
  } catch (err) {
    expect(err).toBeInstanceOf(Response);
    expect((err as Response).status).toBe(status);
  }
}

describe('v1.hooks.proofig.pdf-stored action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getConfig.mockResolvedValue({
      api: { handshakeIssuer: 'iss', handshakeSigningSecret: 'sec' },
    });
    mocks.verifyHandshakeToken.mockReturnValue({
      aud: PROOFIG_PERSIST_PDF,
      jobId: JOB_ID,
    });
    mocks.patchProofigRunServiceData.mockResolvedValue({});
    mocks.enqueueProofigPersistPdfFollowUpIfNeeded.mockResolvedValue({
      enqueued: false,
      reason: 'not-needed',
    });
    mocks.getPrismaClient.mockResolvedValue({
      job: {
        findUnique: vi.fn().mockResolvedValue({
          id: JOB_ID,
          job_type: PROOFIG_PERSIST_PDF,
          payload: {
            work_version_id: WV_ID,
            check_service_run_id: RUN_ID,
            report_id: 'report-1',
          },
        }),
      },
      checkServiceRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: RUN_ID,
          work_version_id: WV_ID,
        }),
      },
      workVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: WV_ID,
          cdn_key: CDN_KEY,
        }),
      },
    });
  });

  it('returns 401 when handshake token is missing', async () => {
    await expectResponseStatus(() => action(makeArgs({ auth: null })), 401);
  });

  it('returns 401 without database work when handshake verification throws', async () => {
    mocks.verifyHandshakeToken.mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    await expectResponseStatus(() => action(makeArgs({})), 401);

    expect(mocks.getPrismaClient).not.toHaveBeenCalled();
    expect(mocks.patchProofigRunServiceData).not.toHaveBeenCalled();
  });

  it('returns 401 when handshake audience mismatches', async () => {
    mocks.verifyHandshakeToken.mockReturnValue({ aud: 'OTHER', jobId: JOB_ID });
    await expectResponseStatus(() => action(makeArgs({})), 401);
  });

  it('returns 401 when handshake jobId is missing', async () => {
    mocks.verifyHandshakeToken.mockReturnValue({ aud: PROOFIG_PERSIST_PDF });
    await expectResponseStatus(() => action(makeArgs({})), 401);
  });

  it('returns 403 when job check_service_run_id does not match URL id', async () => {
    mocks.getPrismaClient.mockResolvedValue({
      job: {
        findUnique: vi.fn().mockResolvedValue({
          id: JOB_ID,
          job_type: PROOFIG_PERSIST_PDF,
          payload: {
            work_version_id: WV_ID,
            check_service_run_id: 'other-run',
          },
        }),
      },
      checkServiceRun: {
        findUnique: vi.fn().mockResolvedValue({ id: RUN_ID, work_version_id: WV_ID }),
      },
      workVersion: {
        findUnique: vi.fn().mockResolvedValue({ id: WV_ID, cdn_key: CDN_KEY }),
      },
    });
    await expectResponseStatus(() => action(makeArgs({})), 403);
  });

  it('returns 403 when work_version_id does not match the job', async () => {
    await expectResponseStatus(
      () =>
        action(
          makeArgs({
            body: validBody({ work_version_id: '22222222-2222-4222-8222-222222222222' }),
          }),
        ),
      403,
    );
  });

  it('returns 403 when path is not the absolute cdn_key-prefixed key', async () => {
    await expectResponseStatus(
      () =>
        action(
          makeArgs({
            body: validBody({ path: `generated/${RUN_ID}/proofig-report.pdf` }),
          }),
        ),
      403,
    );
  });

  it('registers the file and returns 200 for a valid handshake + path', async () => {
    const res = await action(makeArgs({}));
    expect(res.status).toBe(200);
    expect(mocks.patchProofigRunServiceData).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueProofigPersistPdfFollowUpIfNeeded).toHaveBeenCalledWith(
      RUN_ID,
      expect.objectContaining({ excludeJobId: JOB_ID, jobReportId: 'report-1' }),
    );
  });

  it('prefers the job payload report_id over the request body', async () => {
    const res = await action(makeArgs({ body: validBody({ report_id: undefined }) }));
    expect(res.status).toBe(200);
    const patcher = mocks.patchProofigRunServiceData.mock.calls[0][1] as (sd: {
      reportId?: string;
    }) => { storedReportId?: string };
    const next = patcher({});
    expect(next.storedReportId).toBe('report-1');
  });

  it('returns 403 when body report_id disagrees with the job payload', async () => {
    await expectResponseStatus(
      () => action(makeArgs({ body: validBody({ report_id: 'report-other' }) })),
      403,
    );
  });
});
