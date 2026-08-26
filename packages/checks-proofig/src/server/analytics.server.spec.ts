// eslint-disable-next-line import/no-extraneous-dependencies
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageIntegrityTrackEvent } from '../analytics.catalog.js';
import { KnownState, MINIMAL_PROOFIG_SERVICE_DATA } from '../schema.js';
import type { ProofigDataSchema } from '../schema.js';
import {
  resolveProofigTerminalOutcomeFromServiceData,
  trackProofigTerminalTransition,
} from './analytics.server.js';

const mockTrackChecksEventForUser = vi.fn();

vi.mock('@hhmi/checks-shared/analytics/server', () => ({
  trackChecksEvent: vi.fn(),
  trackChecksEventForUser: (...args: unknown[]) => mockTrackChecksEventForUser(...args),
}));

vi.mock('@hhmi/checks-shared/analytics/runContext.server', () => ({
  loadChecksRunAnalyticsContext: vi.fn(),
  runLifecyclePropsFromRow: vi.fn((_run, kind) => ({ checkKind: kind, checkRunId: _run.id })),
}));

const RUN_ROW = {
  id: 'run-1',
  kind: 'proofig',
  work_version_id: 'wv-1',
  created_by_id: 'user-1',
};

const TIMESTAMP = '2025-01-01T00:00:00Z';

describe('resolveProofigTerminalOutcomeFromServiceData', () => {
  it('returns null while the pipeline is still in progress', () => {
    const data: ProofigDataSchema = {
      stages: {
        initialPost: { status: 'processing', history: [], timestamp: TIMESTAMP },
      },
    };
    expect(resolveProofigTerminalOutcomeFromServiceData(data)).toBeNull();
  });

  it('returns completed for report clean and flagged notify outcomes', () => {
    expect(
      resolveProofigTerminalOutcomeFromServiceData({
        ...MINIMAL_PROOFIG_SERVICE_DATA,
        summary: { state: KnownState.ReportClean, receivedAt: TIMESTAMP },
      }),
    ).toBe('completed');
    expect(
      resolveProofigTerminalOutcomeFromServiceData({
        ...MINIMAL_PROOFIG_SERVICE_DATA,
        summary: { state: KnownState.ReportFlagged, receivedAt: TIMESTAMP },
      }),
    ).toBe('completed');
  });

  it('returns failed for provider deletion', () => {
    expect(
      resolveProofigTerminalOutcomeFromServiceData({
        ...MINIMAL_PROOFIG_SERVICE_DATA,
        deleted: true,
        summary: { state: KnownState.Deleted, receivedAt: TIMESTAMP },
      }),
    ).toBe('failed');
  });

  it('returns failed when a local stage errors', () => {
    const data: ProofigDataSchema = {
      stages: {
        documentPreparation: {
          status: 'error',
          history: [],
          timestamp: TIMESTAMP,
          error: 'Document conversion failed',
        },
        initialPost: { status: 'pending', history: [], timestamp: TIMESTAMP },
      },
    };
    expect(resolveProofigTerminalOutcomeFromServiceData(data)).toBe('failed');
  });

  it('returns failed when initial post errors after submit', () => {
    const data: ProofigDataSchema = {
      stages: {
        initialPost: {
          status: 'error',
          history: [],
          timestamp: TIMESTAMP,
          error: 'Provider timeout',
        },
      },
    };
    expect(resolveProofigTerminalOutcomeFromServiceData(data)).toBe('failed');
  });
});

describe('trackProofigTerminalTransition', () => {
  beforeEach(() => {
    mockTrackChecksEventForUser.mockReset();
  });

  it('emits CHECKS_RUN_FAILED when a stage first transitions to error', async () => {
    const before: ProofigDataSchema = {
      stages: {
        initialPost: { status: 'processing', history: [], timestamp: TIMESTAMP },
      },
    };
    const after: ProofigDataSchema = {
      stages: {
        initialPost: {
          status: 'error',
          history: [],
          timestamp: TIMESTAMP,
          error: 'Provider timeout',
        },
      },
    };

    await trackProofigTerminalTransition(RUN_ROW, before, after);

    expect(mockTrackChecksEventForUser).toHaveBeenCalledWith(
      'user-1',
      ImageIntegrityTrackEvent.CHECKS_RUN_FAILED,
      expect.objectContaining({ checkRunId: 'run-1' }),
      undefined,
    );
  });

  it('emits CHECKS_RUN_COMPLETED when a report arrives on a later notify', async () => {
    const before: ProofigDataSchema = {
      ...MINIMAL_PROOFIG_SERVICE_DATA,
      stages: {
        ...MINIMAL_PROOFIG_SERVICE_DATA.stages,
        integrityDetection: { status: 'completed', history: [], timestamp: TIMESTAMP },
      },
    };
    const after: ProofigDataSchema = {
      ...before,
      summary: { state: KnownState.ReportClean, receivedAt: TIMESTAMP },
    };

    await trackProofigTerminalTransition(RUN_ROW, before, after);

    expect(mockTrackChecksEventForUser).toHaveBeenCalledWith(
      'user-1',
      ImageIntegrityTrackEvent.CHECKS_RUN_COMPLETED,
      expect.objectContaining({ checkRunId: 'run-1' }),
      undefined,
    );
  });

  it('does not emit a second terminal event after failure was tracked', async () => {
    const before: ProofigDataSchema = {
      stages: {
        initialPost: {
          status: 'error',
          history: [],
          timestamp: TIMESTAMP,
          error: 'Provider timeout',
        },
      },
    };
    const after: ProofigDataSchema = {
      stages: {
        initialPost: {
          status: 'error',
          history: [],
          timestamp: TIMESTAMP,
          error: 'Provider timeout (retried message)',
        },
      },
    };

    await trackProofigTerminalTransition(RUN_ROW, before, after);

    expect(mockTrackChecksEventForUser).not.toHaveBeenCalled();
  });
});
