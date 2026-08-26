// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@curvenote/scms-db';
import type { TextIntegrityDataSchema } from '../schema.js';

const scmsServerMocks = vi.hoisted(() => ({
  getPrismaClient: vi.fn(),
}));

const checkRunColumnMocks = vi.hoisted(() => ({
  safeCheckServiceRunPatch: vi.fn(),
  patchTextIntegrityRunServiceData: vi.fn(),
  checkRunCoarseStatus: vi.fn((s: string) => s),
  errorColumnPatch: vi.fn(() => ({ status: 'error' })),
}));

const eulaMocks = vi.hoisted(() => ({
  assertSubmitterEulaAccepted: vi.fn(),
  getEulaStatusForUser: vi.fn(),
}));

const analyticsMocks = vi.hoisted(() => ({
  trackTextIntegrityRunStartFailed: vi.fn(),
}));

const startCheckRunMocks = vi.hoisted(() => ({
  startTextIntegrityCheckRun: vi.fn(),
}));

vi.mock('@curvenote/scms-server', () => scmsServerMocks);

vi.mock('./checkRunColumns.server.js', () => checkRunColumnMocks);

vi.mock('./config.server.js', () => ({
  getTextIntegrityConfigWithOverrides: vi.fn(async () => ({
    serviceName: 'ithenticate',
    relayInstanceId: 'default',
  })),
}));

const scopeMocks = vi.hoisted(() => ({
  guardTextIntegrityWorkCheckScopes: vi.fn(async (ctx: unknown) => ({
    ok: true as const,
    ctx,
    workId: 'work-1',
  })),
}));

vi.mock('./checkWorkScopes.server.js', () => ({
  guardTextIntegrityWorkCheckScopes: scopeMocks.guardTextIntegrityWorkCheckScopes,
  TEXT_INTEGRITY_DISPATCH_INTENTS: new Set([
    'accept-eula',
    'execute',
    'retry',
    'refresh-viewer-url',
    'relay-status',
    'restart-similarity-pdf',
  ]),
}));

vi.mock('./eula.server.js', () => ({
  acceptEulaAtProvider: vi.fn(),
  assertSubmitterEulaAccepted: eulaMocks.assertSubmitterEulaAccepted,
  buildViewerEulaPayload: vi.fn(),
  getEulaStatusForUser: eulaMocks.getEulaStatusForUser,
  recordUserEulaAcceptance: vi.fn(),
}));

vi.mock('./analytics.server.js', () => ({
  trackTextIntegrityRunStartFailed: analyticsMocks.trackTextIntegrityRunStartFailed,
}));

vi.mock('./startCheckRun.server.js', () => ({
  startTextIntegrityCheckRun: startCheckRunMocks.startTextIntegrityCheckRun,
}));

vi.mock('./retryCheckRun.server.js', () => ({
  retryTextIntegrityCheckRun: vi.fn(),
}));

const relayStatusMocks = vi.hoisted(() => ({
  applyRelayCheckStatusEnvelopes: vi.fn(async () => ({ ok: true as const })),
  enqueuePersistPdfAfterRelayStatusIfNeeded: vi.fn(async () => undefined),
}));

vi.mock('./relay-status-apply.server.js', () => ({
  applyRelayCheckStatusEnvelopes: relayStatusMocks.applyRelayCheckStatusEnvelopes,
}));

vi.mock('./relay-status-persist-enqueue.server.js', () => ({
  enqueuePersistPdfAfterRelayStatusIfNeeded:
    relayStatusMocks.enqueuePersistPdfAfterRelayStatusIfNeeded,
}));

vi.mock('./slackNotify.server.js', () => ({
  notifyTextIntegrityActionError: vi.fn(),
  notifyTextIntegrityEulaAccepted: vi.fn(),
}));

vi.mock('@hhmi/checks-shared/analytics/server', () => ({
  trackChecksEvent: vi.fn(),
}));

import { handleTextIntegrityAction } from './actions.js';

type CheckServiceRunData = {
  serviceData: TextIntegrityDataSchema;
};

function restartForm(checkRunId: string): FormData {
  const formData = new FormData();
  formData.set('checkRunId', checkRunId);
  return formData;
}

function restartArgs(checkRunId: string) {
  return {
    intent: 'restart-similarity-pdf',
    workVersionId: 'wv-1',
    formData: restartForm(checkRunId),
    ctx: {
      user: { id: 'user-1' },
      $config: {
        app: {
          checks: {
            relayBaseUrl: 'https://relay.example.com/',
            relayApiKey: 'secret',
          },
          extensions: {
            'checks-text-integrity': {},
          },
        },
      },
    },
  } as Parameters<typeof handleTextIntegrityAction>[0];
}

describe('handleTextIntegrityAction restart-similarity-pdf', () => {
  const checkRunId = 'run-1';
  let runData: CheckServiceRunData;
  let findCheckRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();

    runData = {
      serviceData: {
        externalId: 'external-check-1',
        reportPdfId: 'pdf-old',
        similarityReportPdfInvalidated: true,
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'error',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
            error: 'previous PDF generation failed',
          },
        },
      },
    };

    findCheckRun = vi.fn(async () => ({
      id: checkRunId,
      work_version_id: 'wv-1',
      kind: 'checks-text-integrity',
      data: runData,
    }));
    scmsServerMocks.getPrismaClient.mockResolvedValue({
      checkServiceRun: {
        findFirst: findCheckRun,
      },
    });
    checkRunColumnMocks.safeCheckServiceRunPatch.mockImplementation(
      async (_id: string, update: (data?: Prisma.JsonValue) => Prisma.JsonObject | null) => {
        const next = update(runData as Prisma.JsonValue);
        if (next) runData = next as CheckServiceRunData;
        return { id: checkRunId, data: runData };
      },
    );
  });

  it('does not issue a second relay start while a previous restart is already processing', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        result: { pdf_id: 'pdf-new' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleTextIntegrityAction(restartArgs(checkRunId))).resolves.toEqual({
      success: true,
    });
    await expect(handleTextIntegrityAction(restartArgs(checkRunId))).resolves.toEqual({
      success: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example.com/api/v1/services/ithenticate/instances/default/check/external-check-1/report/pdf/start',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret',
        },
        body: '{}',
      }),
    );
    expect(runData.serviceData.stages.reportGeneration?.status).toBe('processing');
    expect(runData.serviceData.reportPdfId).toBe('pdf-new');
  });

  it('force-restarts a completed non-stale PDF from the menu path', async () => {
    runData = {
      serviceData: {
        externalId: 'external-check-1',
        reportPdfId: 'pdf-old',
        similarityReportStored: true,
        storedReportPdfId: 'pdf-old',
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'completed',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      },
    };
    findCheckRun.mockImplementation(async () => ({
      id: checkRunId,
      work_version_id: 'wv-1',
      kind: 'checks-text-integrity',
      data: runData,
    }));

    const fetchMock = vi.fn(async () =>
      Response.json({
        result: { pdf_id: 'pdf-forced' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleTextIntegrityAction(restartArgs(checkRunId))).resolves.toEqual({
      success: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(runData.serviceData.reportPdfId).toBe('pdf-forced');
    expect(runData.serviceData.stages.reportGeneration?.status).toBe('processing');
  });

  it('requires the run to belong to the authorized work version', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        result: { pdf_id: 'pdf-new' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    findCheckRun.mockResolvedValueOnce(null);

    await expect(handleTextIntegrityAction(restartArgs(checkRunId))).resolves.toEqual({
      error: { type: 'general', message: 'Check run not found' },
      status: 404,
    });

    expect(findCheckRun).toHaveBeenCalledWith({
      where: {
        id: checkRunId,
        work_version_id: 'wv-1',
        kind: 'checks-text-integrity',
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('handleTextIntegrityAction relay-status PDF claim', () => {
  const checkRunId = 'run-1';
  let runData: CheckServiceRunData;
  let findCheckRun: ReturnType<typeof vi.fn>;

  function relayStatusArgs() {
    const formData = new FormData();
    formData.set('checkRunId', checkRunId);
    return {
      intent: 'relay-status',
      workVersionId: 'wv-1',
      formData,
      ctx: {
        user: { id: 'user-1' },
        $config: {
          app: {
            checks: {
              relayBaseUrl: 'https://relay.example.com/',
              relayApiKey: 'secret',
            },
            extensions: {
              'checks-text-integrity': {},
            },
          },
        },
      },
    } as Parameters<typeof handleTextIntegrityAction>[0];
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    relayStatusMocks.applyRelayCheckStatusEnvelopes.mockResolvedValue({ ok: true });
    relayStatusMocks.enqueuePersistPdfAfterRelayStatusIfNeeded.mockResolvedValue(undefined);

    runData = {
      serviceData: {
        externalId: 'external-check-1',
        stages: {
          submission: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          processing: { status: 'completed', history: [], timestamp: '2025-01-01T00:00:00Z' },
          reportGeneration: {
            status: 'pending',
            history: [],
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
      },
    };

    findCheckRun = vi.fn(async () => ({
      id: checkRunId,
      work_version_id: 'wv-1',
      kind: 'checks-text-integrity',
      data: runData,
    }));
    scmsServerMocks.getPrismaClient.mockResolvedValue({
      checkServiceRun: {
        findFirst: findCheckRun,
      },
    });
    checkRunColumnMocks.safeCheckServiceRunPatch.mockImplementation(
      async (_id: string, update: (data?: Prisma.JsonValue) => Prisma.JsonObject | null) => {
        const next = update(runData as Prisma.JsonValue);
        if (next) runData = next as CheckServiceRunData;
        return { id: checkRunId, data: runData };
      },
    );
  });

  it('starts PDF once under claim when similarity is done, aged past grace, and no reportPdfId', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/status')) {
        return Response.json({ envelopes: [] });
      }
      return Response.json({ result: { pdf_id: 'pdf-new' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleTextIntegrityAction(relayStatusArgs())).resolves.toEqual({ success: true });
    await expect(handleTextIntegrityAction(relayStatusArgs())).resolves.toEqual({ success: true });

    const pdfStartCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/report/pdf/start'),
    );
    expect(pdfStartCalls).toHaveLength(1);
    expect(runData.serviceData.reportPdfId).toBe('pdf-new');
    expect(runData.serviceData.stages.reportGeneration?.status).toBe('processing');
  });

  it('does not start PDF during the post-processing grace window', async () => {
    runData.serviceData.stages!.processing = {
      status: 'completed',
      history: [],
      timestamp: new Date().toISOString(),
    };

    const fetchMock = vi.fn(async () => Response.json({ envelopes: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleTextIntegrityAction(relayStatusArgs())).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [statusUrl] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(statusUrl).toContain('/status');
    expect(runData.serviceData.reportPdfId).toBeUndefined();
    expect(runData.serviceData.stages?.reportGeneration?.status).toBe('pending');
  });

  it('starts PDF on same Refresh when status catch-up completes processing', async () => {
    runData.serviceData.stages!.processing = {
      status: 'processing',
      history: [],
      timestamp: '2025-01-01T00:00:00Z',
    };

    const processingCompleteEnvelope = {
      event: 'PROCESSING_PHASE_COMPLETE',
      check_id: 'external-check-1',
      client_id: checkRunId,
      service_name: 'ithenticate',
      occurred_at: '2025-01-01T00:05:00Z',
      payload: { completed: true },
    };

    relayStatusMocks.applyRelayCheckStatusEnvelopes.mockImplementation(async () => {
      runData.serviceData.stages!.processing = {
        status: 'completed',
        history: [],
        timestamp: new Date().toISOString(),
      };
      runData.serviceData.stages!.reportGeneration = {
        status: 'pending',
        history: [],
        timestamp: new Date().toISOString(),
      };
      return { ok: true as const };
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/status')) {
        return Response.json({ envelopes: [processingCompleteEnvelope] });
      }
      return Response.json({ result: { pdf_id: 'pdf-catch-up' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleTextIntegrityAction(relayStatusArgs())).resolves.toEqual({ success: true });

    const pdfStartCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/report/pdf/start'),
    );
    expect(pdfStartCalls).toHaveLength(1);
    expect(runData.serviceData.reportPdfId).toBe('pdf-catch-up');
    expect(runData.serviceData.stages.reportGeneration?.status).toBe('processing');
  });

  it('starts PDF once under claim after the grace window elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/status')) {
        return Response.json({ envelopes: [] });
      }
      return Response.json({ result: { pdf_id: 'pdf-aged' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleTextIntegrityAction(relayStatusArgs())).resolves.toEqual({ success: true });
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/report/pdf/start')),
    ).toHaveLength(0);

    vi.setSystemTime(new Date('2025-01-01T00:00:11Z'));
    await expect(handleTextIntegrityAction(relayStatusArgs())).resolves.toEqual({ success: true });

    const pdfStartCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/report/pdf/start'),
    );
    expect(pdfStartCalls).toHaveLength(1);
    expect(runData.serviceData.reportPdfId).toBe('pdf-aged');

    vi.useRealTimers();
  });

  it('returns a recovery warning when proactive PDF start fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/status')) {
        return Response.json({ envelopes: [] });
      }
      return new Response('relay down', { status: 502 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleTextIntegrityAction(relayStatusArgs());
    expect(result).toEqual({
      success: true,
      recovery: {
        ok: false,
        message: expect.stringContaining('502'),
        status: 502,
      },
    });
  });

  it('does not start PDF when reportPdfId is already known (status poll only)', async () => {
    runData.serviceData.reportPdfId = 'pdf-existing';
    runData.serviceData.stages.reportGeneration = {
      status: 'processing',
      history: [],
      timestamp: '2025-01-01T00:00:00Z',
    };

    const fetchMock = vi.fn(async () => Response.json({ envelopes: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(handleTextIntegrityAction(relayStatusArgs())).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [statusUrl, statusInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(statusUrl).toContain('/status');
    expect(JSON.parse(String(statusInit.body))).toEqual({
      client_id: checkRunId,
      pdf_id: 'pdf-existing',
    });
  });
});

describe('handleTextIntegrityAction execute', () => {
  const workVersionId = 'wv-1';
  let createCheckRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    createCheckRun = vi.fn(async () => ({ id: 'failed-run-1' }));
    scmsServerMocks.getPrismaClient.mockResolvedValue({
      checkServiceRun: {
        create: createCheckRun,
      },
    });
    eulaMocks.getEulaStatusForUser.mockResolvedValue({
      requireEula: true,
      eula: { version: '2024-01' },
    });
    startCheckRunMocks.startTextIntegrityCheckRun.mockResolvedValue({
      ok: true,
      checkRunId: 'run-1',
    });
  });

  it('emits CHECKS_RUN_START_FAILED when execute is blocked by EULA', async () => {
    const eulaBlock = 'Accept the Text Integrity EULA before running this check.';
    eulaMocks.assertSubmitterEulaAccepted.mockResolvedValue(eulaBlock);

    await expect(
      handleTextIntegrityAction({
        intent: 'execute',
        workVersionId,
        ctx: {
          user: { id: 'user-1' },
          $config: {
            app: {
              extensions: {
                'checks-text-integrity': {},
              },
            },
          },
        },
      } as Parameters<typeof handleTextIntegrityAction>[0]),
    ).resolves.toEqual({
      error: { type: 'general', message: eulaBlock },
      status: 400,
      requiresEula: true,
      requireEula: true,
      eula: { version: '2024-01' },
    });

    expect(createCheckRun).toHaveBeenCalledOnce();
    expect(analyticsMocks.trackTextIntegrityRunStartFailed).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 'user-1' } }),
      workVersionId,
      expect.any(String),
      eulaBlock,
      expect.objectContaining({ trigger: 'checks_page' }),
    );
    expect(startCheckRunMocks.startTextIntegrityCheckRun).not.toHaveBeenCalled();
  });
});
