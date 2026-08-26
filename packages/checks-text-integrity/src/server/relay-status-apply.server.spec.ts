// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RelayNotifyEnvelope } from '@curvenote/check-relay-types';
import { MINIMAL_TEXT_INTEGRITY_SERVICE_DATA, type TextIntegrityDataSchema } from '../schema.js';
import { applyRelayCheckStatusEnvelopes } from './relay-status-apply.server.js';

const mockFindUnique = vi.fn();
const mockPatch = vi.fn();
const mockTrackTerminal = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: vi.fn(async () => ({
    checkServiceRun: { findUnique: mockFindUnique },
  })),
}));

vi.mock('./checkRunColumns.server.js', () => ({
  patchTextIntegrityRunServiceData: (...args: unknown[]) => mockPatch(...args),
}));

vi.mock('./analytics.server.js', () => ({
  trackTextIntegrityTerminalTransition: (...args: unknown[]) => mockTrackTerminal(...args),
}));

const TS = '2025-01-01T00:00:00Z';

const existingRun = {
  id: 'run-1',
  kind: 'checks-text-integrity',
  work_version_id: 'wv-1',
  created_by_id: 'user-1',
  attempt: 1,
  retry_of_id: null,
  date_created: TS,
};

function processingRun(): TextIntegrityDataSchema {
  return {
    ...MINIMAL_TEXT_INTEGRITY_SERVICE_DATA,
    stages: {
      submission: { status: 'completed', history: [], timestamp: TS },
      processing: { status: 'processing', history: [], timestamp: TS },
    },
  };
}

const processingCompleteEnvelope: RelayNotifyEnvelope = {
  event: 'PROCESSING_PHASE_COMPLETE',
  check_id: 'sub-1',
  client_id: 'run-1',
  service_name: 'checker',
  occurred_at: TS,
  payload: {
    completed: true,
    provider_payload: {
      submission_id: 'sub-1',
      overall_match_percentage: 12,
      internet_match_percentage: 5,
      publication_match_percentage: 3,
      submitted_works_match_percentage: 4,
      status: 'COMPLETE',
      time_requested: TS,
      time_generated: TS,
      top_source_largest_matched_word_count: 100,
      top_matches: [],
    },
    report: { report_id: 'pdf-1' },
  },
};

describe('applyRelayCheckStatusEnvelopes', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockPatch.mockReset();
    mockTrackTerminal.mockReset();
    mockFindUnique.mockResolvedValue({
      ...existingRun,
      data: { serviceData: processingRun() },
    });
    mockPatch.mockImplementation(
      async (
        _id: string,
        modifyFn: (current: TextIntegrityDataSchema) => TextIntegrityDataSchema,
      ) => {
        const current = processingRun();
        return modifyFn(current);
      },
    );
  });

  it('returns ok without loading the run when envelopes is empty', async () => {
    const result = await applyRelayCheckStatusEnvelopes('run-1', []);
    expect(result).toEqual({ ok: true });
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockTrackTerminal).not.toHaveBeenCalled();
  });

  it('tracks terminal transition when relay-status envelopes complete processing', async () => {
    const result = await applyRelayCheckStatusEnvelopes('run-1', [processingCompleteEnvelope]);
    expect(result).toEqual({ ok: true });
    expect(mockTrackTerminal).toHaveBeenCalledTimes(1);
    const [run, before, after] = mockTrackTerminal.mock.calls[0] as [
      typeof existingRun,
      TextIntegrityDataSchema,
      TextIntegrityDataSchema,
    ];
    expect(run.id).toBe('run-1');
    expect(before.stages?.processing?.status).toBe('processing');
    expect(after.stages?.processing?.status).toBe('completed');
    expect(after.summaryReport).toBeDefined();
  });

  it('does not track when envelopes are all no-op', async () => {
    const result = await applyRelayCheckStatusEnvelopes('run-1', [
      { event: 'UNKNOWN_EVENT' } as never,
    ]);
    expect(result).toEqual({ ok: true });
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockTrackTerminal).not.toHaveBeenCalled();
  });

  it('forwards request to terminal tracking when provided', async () => {
    const request = new Request('http://localhost/actions');
    const result = await applyRelayCheckStatusEnvelopes('run-1', [processingCompleteEnvelope], {
      request,
    });
    expect(result).toEqual({ ok: true });
    expect(mockTrackTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-1' }),
      expect.any(Object),
      expect.any(Object),
      undefined,
      request,
    );
  });

  it('tracks terminal transition when a later envelope fails after an earlier apply', async () => {
    mockPatch
      .mockImplementationOnce(
        async (
          _id: string,
          modifyFn: (current: TextIntegrityDataSchema) => TextIntegrityDataSchema,
        ) => modifyFn(processingRun()),
      )
      .mockRejectedValueOnce(new Error('Persistence failed'));

    const result = await applyRelayCheckStatusEnvelopes('run-1', [
      processingCompleteEnvelope,
      processingCompleteEnvelope,
    ]);

    expect(result).toEqual({ ok: false, message: 'Persistence failed' });
    expect(mockTrackTerminal).toHaveBeenCalledTimes(1);
    const [, before, after] = mockTrackTerminal.mock.calls[0] as [
      typeof existingRun,
      TextIntegrityDataSchema,
      TextIntegrityDataSchema,
    ];
    expect(before.stages?.processing?.status).toBe('processing');
    expect(after.stages?.processing?.status).toBe('completed');
  });

  it('tracks terminal transition when a later envelope fails validation after an earlier apply', async () => {
    mockPatch.mockImplementationOnce(
      async (
        _id: string,
        modifyFn: (current: TextIntegrityDataSchema) => TextIntegrityDataSchema,
      ) => modifyFn(processingRun()),
    );

    const result = await applyRelayCheckStatusEnvelopes('run-1', [
      processingCompleteEnvelope,
      { not: 'a valid envelope' } as never,
    ]);

    expect(result.ok).toBe(false);
    expect(mockTrackTerminal).toHaveBeenCalledTimes(1);
  });
});
