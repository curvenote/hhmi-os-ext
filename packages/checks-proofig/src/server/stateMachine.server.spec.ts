// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { updateStagesAndServiceDataFromValidatedNotifyPayload } from './stateMachine.server.js';
import {
  type ProofigNotifyState,
  type ProofigDataSchema,
  type ProofigNotifyPayload,
  KnownState,
} from '../schema.js';
import { uuidv7 as uuid } from 'uuidv7';

function makeProofigNotifyPayload(): ProofigNotifyPayload {
  const reportId = uuid();
  return {
    submit_req_id: uuid(),
    report_id: reportId,
    state: 'Processing' as ProofigNotifyState,
    subimages_total: 60,
    matches_review: 4,
    matches_report: 1,
    inspects_report: 1,
    report_url: `https://scms.curvenote.com/v1/hooks/proofig/notify/${reportId}`,
    message: 'Service in process...',
    number: 0,
  };
}

describe('Proofig Workflow', () => {
  describe('Edge Cases', () => {
    it('Will initialize if inital data is missing', () => {
      const initial: ProofigDataSchema = {} as any;
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(initial, {
        ...makeProofigNotifyPayload(),
      });
      expect(next?.stages.initialPost?.status).toEqual('completed');
      expect(next?.stages.subimageDetection?.status).toEqual('processing');
    });
  });

  describe('Service Data Updates', () => {
    it('service data is updated from notify payload', () => {
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: {
            status: 'completed',
            history: [],
            timestamp: new Date().toISOString(),
          },
        },
      };
      const receivedAt = new Date().toISOString();
      const payload = makeProofigNotifyPayload();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        payload,
        receivedAt,
      );

      expect(next).not.toBeNull();
      expect(next?.deleted).toBeFalsy();
      expect(next?.reportId).toBe(payload.report_id);
      expect(next?.reportUrl).toBe(payload.report_url);
      expect(next?.summary?.receivedAt).toBe(receivedAt);
      expect(next?.summary?.subimagesTotal).toBe(payload.subimages_total);
      expect(next?.summary?.matchesReview).toBe(payload.matches_review);
      expect(next?.summary?.matchesReport).toBe(payload.matches_report);
      expect(next?.summary?.inspectsReport).toBe(payload.inspects_report);
      expect(next?.summary?.number).toBe(payload.number);
      expect(next?.summary?.message).toBe(payload.message);
    });

    it('history logging for linear stages', async () => {
      const initialTimestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: {
            status: 'completed',
            history: [],
            timestamp: initialTimestamp,
          },
          subimageDetection: {
            status: 'pending',
            history: [],
            timestamp: initialTimestamp,
          },
        },
      };

      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(initial, {
        ...makeProofigNotifyPayload(),
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      const pingingAt = new Date();
      expect(next?.stages.subimageDetection?.status).toBe('processing');
      expect(new Date(next?.stages.subimageDetection?.timestamp ?? '').valueOf()).toBeLessThan(
        pingingAt.valueOf(),
      );
      expect(next?.stages.subimageDetection?.history).toHaveLength(1);
      expect(next?.stages.subimageDetection?.history[0].status).toBe('pending');
      expect(next?.stages.subimageDetection?.history[0].timestamp).toBe(initialTimestamp);

      const next2 = updateStagesAndServiceDataFromValidatedNotifyPayload(next!, {
        ...makeProofigNotifyPayload(),
        state: 'Awaiting: Sub-Image Approval' as ProofigNotifyState,
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(next2?.stages.subimageDetection?.status).toBe('completed');
      expect(next2?.stages.subimageDetection?.history).toHaveLength(2);
      expect(next2?.stages.subimageDetection?.history[1].status).toBe('pending');
      expect(next2?.stages.subimageDetection?.history[1].timestamp).toBe(initialTimestamp);
      expect(next2?.stages.subimageDetection?.history[0].status).toBe('processing');
    });

    it('history logging for review stage', async () => {
      const initialTimestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp: initialTimestamp },
          subimageDetection: { status: 'completed', history: [], timestamp: initialTimestamp },
          subimageSelection: { status: 'completed', history: [], timestamp: initialTimestamp },
          integrityDetection: {
            status: 'processing',
            history: [],
            timestamp: initialTimestamp,
          },
          resultsReview: {
            status: 'pending',
            outcome: 'pending',
            history: [],
            timestamp: initialTimestamp,
          },
        },
      };

      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        { ...makeProofigNotifyPayload(), state: 'Awaiting: Review' as ProofigNotifyState },
        receivedAt,
      );

      await new Promise((resolve) => setTimeout(resolve, 20));

      const pingingAt = new Date();
      expect(next?.stages.resultsReview?.status).toBe('requested');
      expect(next?.stages.resultsReview?.outcome).toBe('pending');
      expect(next?.stages.resultsReview?.timestamp).toBe(receivedAt);
      expect(new Date(next?.stages.resultsReview?.timestamp ?? '').valueOf()).toBeLessThan(
        pingingAt.valueOf(),
      );
      expect(next?.stages.resultsReview?.history).toHaveLength(1);
      expect(next?.stages.resultsReview?.history[0].status).toBe('pending');
      expect(next?.stages.resultsReview?.history[0].outcome).toBe('pending');
      expect(next?.stages.resultsReview?.history[0].timestamp).toBe(initialTimestamp);
    });
  });
  describe('State Transitions', () => {
    it('Initial Post completed -> Subimage Detection processing', () => {
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp: new Date().toISOString() },
        },
      };
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(initial, {
        ...makeProofigNotifyPayload(),
        state: KnownState.Processing,
      });
      expect(next?.stages.subimageDetection?.status).toEqual('processing');
    });
    it('Subimage Detection completed -> Subimage Selection pending', () => {
      const initialTimestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: {
            status: 'completed',
            history: [
              {
                status: 'pending',
                timestamp: initialTimestamp,
              },
              {
                status: 'processing',
                timestamp: initialTimestamp,
              },
            ],
            timestamp: initialTimestamp,
          },
          subimageDetection: {
            status: 'processing',
            history: [
              {
                status: 'pending',
                timestamp: initialTimestamp,
              },
            ],
            timestamp: initialTimestamp,
          },
        },
      };

      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.AwaitingSubImageApproval,
        },
        receivedAt,
      );
      expect(next?.stages.subimageDetection?.status).toEqual('completed');
      expect(next?.stages.subimageDetection?.timestamp).toEqual(receivedAt);
      expect(next?.stages.subimageDetection?.history).toHaveLength(2);
      expect(next?.stages.subimageDetection?.history[0].status).toEqual('processing');
      expect(next?.stages.subimageDetection?.history[0].timestamp).toEqual(initialTimestamp);

      expect(next?.stages.subimageSelection?.status).toEqual('pending');
      expect(next?.stages.subimageSelection?.timestamp).toEqual(receivedAt);
    });
    it('Subimage Selection pending -> Integrity Detection processing', () => {
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp: new Date().toISOString() },
          subimageDetection: {
            status: 'completed',
            history: [],
            timestamp: new Date().toISOString(),
          },
          subimageSelection: {
            status: 'pending',
            history: [],
            timestamp: new Date().toISOString(),
          },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.Processing,
        },
        receivedAt,
      );

      expect(next?.stages.subimageSelection?.status).toEqual('completed');
      expect(next?.stages.subimageSelection?.history).toHaveLength(1);
      expect(next?.stages.integrityDetection?.status).toEqual('processing');
      expect(next?.stages.integrityDetection?.history).toHaveLength(0);
    });
    it('Integrity Detection processing -> Report: Clean', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: {
            status: 'completed',
            history: [],
            timestamp: timestamp,
          },
          subimageSelection: {
            status: 'completed',
            history: [],
            timestamp: timestamp,
          },
          integrityDetection: {
            status: 'processing',
            history: [],
            timestamp: timestamp,
          },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.ReportClean,
        },
        receivedAt,
      );
      expect(next?.stages.integrityDetection?.status).toEqual('completed');
      expect(next?.stages.integrityDetection?.history).toHaveLength(1);
      expect(next?.stages.integrityDetection?.history[0].status).toEqual('processing');

      expect(next?.stages.resultsReview?.status).toEqual('not-requested');
      expect(next?.stages.resultsReview?.outcome).toEqual('clean');
      expect(next?.stages.resultsReview?.history).toHaveLength(0);
    });
    it('Awaiting: Review when subimage detection still pending (late notify; catch up all linear stages)', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'pending', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.AwaitingReview,
        },
        receivedAt,
      );
      expect(next).not.toBeNull();
      expect(next?.stages.subimageDetection?.status).toEqual('notify-skipped');
      expect(next?.stages.subimageSelection?.status).toEqual('notify-skipped');
      expect(next?.stages.integrityDetection?.status).toEqual('notify-skipped');
      expect(next?.stages.resultsReview?.status).toEqual('requested');
    });
    it('Awaiting: Review when subimage selection still pending and integrity never started (skipped Processing notify)', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'pending', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.AwaitingReview,
        },
        receivedAt,
      );
      expect(next).not.toBeNull();
      expect(next?.stages.subimageDetection?.status).toEqual('completed');
      expect(next?.stages.subimageSelection?.status).toEqual('notify-skipped');
      expect(next?.stages.integrityDetection?.status).toEqual('notify-skipped');
      expect(next?.stages.resultsReview?.status).toEqual('requested');
      expect(next?.stages.resultsReview?.outcome).toEqual('pending');
    });
    it('Report: Flagged when subimage selection still pending and integrity never started', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'pending', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.ReportFlagged,
        },
        receivedAt,
      );
      expect(next).not.toBeNull();
      expect(next?.stages.subimageSelection?.status).toEqual('notify-skipped');
      expect(next?.stages.integrityDetection?.status).toEqual('notify-skipped');
      expect(next?.stages.resultsReview?.status).toEqual('completed');
      expect(next?.stages.resultsReview?.outcome).toEqual('flagged');
    });
    it('Report: Clean when subimage selection still pending and integrity never started', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'pending', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.ReportClean,
        },
        receivedAt,
      );
      expect(next).not.toBeNull();
      expect(next?.stages.subimageSelection?.status).toEqual('notify-skipped');
      expect(next?.stages.integrityDetection?.status).toEqual('notify-skipped');
      expect(next?.stages.resultsReview?.status).toEqual('not-requested');
      expect(next?.stages.resultsReview?.outcome).toEqual('clean');
    });
    it('Integrity Detection processing -> Results Review requested', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: {
            status: 'completed',
            history: [],
            timestamp,
          },
          subimageSelection: {
            status: 'completed',
            history: [],
            timestamp,
          },
          integrityDetection: {
            status: 'processing',
            history: [],
            timestamp,
          },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.AwaitingReview,
        },
        receivedAt,
      );
      expect(next?.stages.integrityDetection?.status).toEqual('completed');
      expect(next?.stages.integrityDetection?.history).toHaveLength(1);

      expect(next?.stages.resultsReview?.status).toEqual('requested');
      expect(next?.stages.resultsReview?.outcome).toEqual('pending');
      expect(next?.stages.resultsReview?.history).toHaveLength(0);
    });
    it('Results Review requested -> Report: Clean', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'completed', history: [], timestamp },
          resultsReview: { status: 'requested', outcome: 'pending', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.ReportClean,
        },
        receivedAt,
      );
      expect(next?.stages.resultsReview?.status).toEqual('completed');
      expect(next?.stages.resultsReview?.outcome).toEqual('clean');
      expect(next?.stages.resultsReview?.history).toHaveLength(1);
    });
    it('Results Review requested -> Report: Clean', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'completed', history: [], timestamp },
          resultsReview: { status: 'requested', outcome: 'pending', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.ReportClean,
        },
        receivedAt,
      );
      expect(next?.stages.resultsReview?.status).toEqual('completed');
      expect(next?.stages.resultsReview?.outcome).toEqual('clean');
      expect(next?.stages.resultsReview?.history).toHaveLength(1);
    });
    it('Results Review requested -> Report: Flagged', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'completed', history: [], timestamp },
          resultsReview: { status: 'requested', outcome: 'pending', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.ReportFlagged,
        },
        receivedAt,
      );
      expect(next?.stages.resultsReview?.status).toEqual('completed');
      expect(next?.stages.resultsReview?.outcome).toEqual('flagged');
      expect(next?.stages.resultsReview?.history).toHaveLength(1);
    });
    it('Report: Flagged -> Report: Clean', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'completed', history: [], timestamp },
          resultsReview: { status: 'completed', outcome: 'flagged', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.ReportClean,
        },
        receivedAt,
      );
      expect(next?.stages.resultsReview?.status).toEqual('completed');
      expect(next?.stages.resultsReview?.outcome).toEqual('clean');
      expect(next?.stages.resultsReview?.history).toHaveLength(1);
    });
    it('Report: Clean -> Report: Flagged', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'completed', history: [], timestamp },
          resultsReview: { status: 'completed', outcome: 'clean', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.ReportFlagged,
        },
        receivedAt,
      );
      expect(next?.stages.resultsReview?.status).toEqual('completed');
      expect(next?.stages.resultsReview?.outcome).toEqual('flagged');
      expect(next?.stages.resultsReview?.history).toHaveLength(1);
    });
    it('Report: Clean -> Report: Flagged - Case 1 (review requested)', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'completed', history: [], timestamp },
          resultsReview: { status: 'completed', outcome: 'clean', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.ReportFlagged,
        },
        receivedAt,
      );
      expect(next?.stages.resultsReview?.status).toEqual('completed');
      expect(next?.stages.resultsReview?.outcome).toEqual('flagged');
      expect(next?.stages.resultsReview?.history).toHaveLength(1);
    });
    it('Report: Clean -> Report: Flagged - Case 2 (review not requested)', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'completed', history: [], timestamp },
          resultsReview: { status: 'not-requested', outcome: 'clean', history: [], timestamp },
        },
      };
      const receivedAt = new Date().toISOString();
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(
        initial,
        {
          ...makeProofigNotifyPayload(),
          state: KnownState.ReportFlagged,
        },
        receivedAt,
      );
      expect(next).not.toBeNull();
      expect(next?.stages.resultsReview?.status).toEqual('completed');
      expect(next?.stages.resultsReview?.outcome).toEqual('flagged');
      expect(next?.stages.resultsReview?.history).toHaveLength(1);
    });
    it('Report: Flagged -> Report: Flagged', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'completed', history: [], timestamp },
          resultsReview: { status: 'completed', outcome: 'flagged', history: [], timestamp },
        },
      };
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(initial, {
        ...makeProofigNotifyPayload(),
        state: KnownState.ReportFlagged,
      });
      expect(next).not.toBeNull();
      expect(next?.stages.resultsReview?.status).toEqual('completed');
      expect(next?.stages.resultsReview?.outcome).toEqual('flagged');
      expect(next?.stages.resultsReview?.history).toHaveLength(1);
    });
  });
  describe('Transitions to existing states do not update metadata', () => {
    it('Processing (subimages) -> Processing', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'processing', history: [], timestamp },
        },
      };
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(initial, {
        ...makeProofigNotifyPayload(),
        state: KnownState.Processing,
      });
      expect(next).toBeNull();
    });
    it('Processing (integrity) -> Processing', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'processing', history: [], timestamp },
        },
      };
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(initial, {
        ...makeProofigNotifyPayload(),
        state: KnownState.Processing,
      });
      expect(next).toBeNull();
    });
    it('Awaiting: Sub-Image Approval -> Awaiting: Sub-Image Approval', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'pending', history: [], timestamp },
        },
      };
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(initial, {
        ...makeProofigNotifyPayload(),
        state: KnownState.AwaitingSubImageApproval,
      });
      expect(next).toBeNull();
    });
    it('Awaiting: Review -> Awaiting: Review', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'completed', history: [], timestamp },
          resultsReview: { status: 'requested', outcome: 'pending', history: [], timestamp },
        },
      };
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(initial, {
        ...makeProofigNotifyPayload(),
        state: KnownState.AwaitingReview,
      });
      expect(next).toBeNull();
    });
    it('Report: Clean -> Report: Clean', () => {
      const timestamp = new Date().toISOString();
      const initial: ProofigDataSchema = {
        stages: {
          initialPost: { status: 'completed', history: [], timestamp },
          subimageDetection: { status: 'completed', history: [], timestamp },
          subimageSelection: { status: 'completed', history: [], timestamp },
          integrityDetection: { status: 'completed', history: [], timestamp },
          resultsReview: { status: 'completed', outcome: 'clean', history: [], timestamp },
        },
      };
      const next = updateStagesAndServiceDataFromValidatedNotifyPayload(initial, {
        ...makeProofigNotifyPayload(),
        state: KnownState.ReportClean,
      });
      expect(next).toBeNull();
    });
  });
});

describe('Proofig pipeline initialization', () => {
  it('beginProofigPipeline (pdf) completes prep and starts upload', async () => {
    const { beginProofigPipeline } = await import('./stateMachine.server.js');
    const { getCurrentProofigStage } = await import('../schema.js');
    const next = beginProofigPipeline(
      { sourceFormat: 'pdf' },
      undefined,
      '2026-01-01T00:00:00.000Z',
    );
    expect(next.preparation?.sourceFormat).toBe('pdf');
    expect(next.stages.documentPreparation?.status).toBe('completed');
    expect(next.stages.initialPost.status).toBe('processing');
    const { currentStage } = getCurrentProofigStage(next.stages);
    expect(currentStage).toBe('initialPost');
  });

  it('beginProofigPipeline (docx) sets prep processing and leaves initialPost pending', async () => {
    const { beginProofigPipeline } = await import('./stateMachine.server.js');
    const { getCurrentProofigStage } = await import('../schema.js');
    const jobId = uuid();
    const next = beginProofigPipeline(
      { sourceFormat: 'docx', converterJobId: jobId },
      undefined,
      '2026-01-01T00:00:00.000Z',
    );
    expect(next.preparation?.converterJobId).toBe(jobId);
    expect(next.preparation?.sourceFormat).toBe('docx');
    expect(next.stages.documentPreparation?.status).toBe('processing');
    expect(next.stages.initialPost.status).toBe('pending');
    const { currentStage } = getCurrentProofigStage(next.stages);
    expect(currentStage).toBe('documentPreparation');
  });

  it('startDocumentPreparation delegates to beginProofigPipeline', async () => {
    const { startDocumentPreparation } = await import('./stateMachine.server.js');
    const jobId = uuid();
    const next = startDocumentPreparation(jobId, undefined, '2026-01-01T00:00:00.000Z');
    expect(next.preparation?.converterJobId).toBe(jobId);
    expect(next.stages.documentPreparation?.status).toBe('processing');
  });

  it('completeDocumentPreparation marks prep completed', async () => {
    const { beginProofigPipeline, completeDocumentPreparation } =
      await import('./stateMachine.server.js');
    const started = beginProofigPipeline(
      { sourceFormat: 'docx', converterJobId: uuid() },
      undefined,
      '2026-01-01T00:00:00.000Z',
    );
    const done = completeDocumentPreparation(started, '2026-01-02T00:00:00.000Z');
    expect(done.stages.documentPreparation?.status).toBe('completed');
  });
});

describe('Proofig progress step counts', () => {
  it('pdf upload counts initialPost as step 1 of 4 (no visible prep step)', async () => {
    const { beginProofigPipeline } = await import('./stateMachine.server.js');
    const { getStageProgressStep } = await import('../schema.js');
    const next = beginProofigPipeline(
      { sourceFormat: 'pdf' },
      undefined,
      '2026-01-01T00:00:00.000Z',
    );
    expect(getStageProgressStep('initialPost', next.stages, next.preparation)).toEqual({
      step: 1,
      numSteps: 4,
    });
  });

  it('docx upload counts document preparation as step 1 of 5 while converting', async () => {
    const { beginProofigPipeline } = await import('./stateMachine.server.js');
    const { getStageProgressStep } = await import('../schema.js');
    const next = beginProofigPipeline(
      { sourceFormat: 'docx', converterJobId: uuid() },
      undefined,
      '2026-01-01T00:00:00.000Z',
    );
    expect(getStageProgressStep('documentPreparation', next.stages, next.preparation)).toEqual({
      step: 1,
      numSteps: 5,
    });
    expect(getStageProgressStep('initialPost', next.stages, next.preparation)).toEqual({
      step: 2,
      numSteps: 5,
    });
  });
});
