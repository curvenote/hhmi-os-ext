// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import type { RelayRecoveryHint } from '@curvenote/check-relay-types';
import type { TextIntegrityDataSchema } from '../schema.js';
import {
  applyRelayRecoveryLeaseData,
  markRelayRecoveryLocalProcessingStartedData,
  markRelayRecoveryStartedData,
  planRelayRecoveryData,
} from './relay-recovery.server.js';

const RECOVERY: RelayRecoveryHint = {
  phase: 'similarity',
  action: 'start-report-generation',
  reason: 'missing',
  recoverable: true,
};

const NOW = new Date('2026-01-01T00:00:00.000Z');
const ACTIVE_UNTIL = '2026-01-01T00:01:00.000Z';
const EXPIRED_AT = '2025-12-31T23:59:00.000Z';

function runData(serviceData?: TextIntegrityDataSchema) {
  return {
    status: 'healthy',
    serviceData: serviceData ?? {
      stages: {
        submission: {
          status: 'completed' as const,
          history: [],
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        processing: {
          status: 'pending' as const,
          history: [],
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      },
    },
  };
}

function lease(serviceData: TextIntegrityDataSchema | undefined) {
  return serviceData?.relayRecovery;
}

describe('relay recovery lease helpers', () => {
  it('blocks a second acquisition while an active lease exists', () => {
    const first = applyRelayRecoveryLeaseData(runData(), RECOVERY, {
      leaseOwner: 'owner-1',
      requestedAt: NOW,
      leaseExpiresAt: ACTIVE_UNTIL,
      now: NOW,
    });
    expect(first).not.toBeNull();

    const second = applyRelayRecoveryLeaseData(first, RECOVERY, {
      leaseOwner: 'owner-2',
      requestedAt: NOW,
      leaseExpiresAt: ACTIVE_UNTIL,
      now: NOW,
    });

    expect(second).toBeNull();
    expect(lease(first?.serviceData)?.leaseOwner).toBe('owner-1');
  });

  it('allows re-acquire when the prior lease expired and recovery was not started', () => {
    const current = runData({
      ...runData().serviceData,
      relayRecovery: {
        phase: 'similarity',
        action: 'start-report-generation',
        reason: 'missing',
        requestedAt: '2025-12-31T23:58:00.000Z',
        leaseOwner: 'owner-1',
        leaseExpiresAt: EXPIRED_AT,
      },
    } as TextIntegrityDataSchema);

    const next = applyRelayRecoveryLeaseData(current, RECOVERY, {
      leaseOwner: 'owner-2',
      requestedAt: NOW,
      leaseExpiresAt: ACTIVE_UNTIL,
      now: NOW,
    });

    expect(lease(next?.serviceData)?.leaseOwner).toBe('owner-2');
  });

  it('blocks re-acquire permanently once recovery was started', () => {
    const current = runData({
      ...runData().serviceData,
      relayRecovery: {
        phase: 'similarity',
        action: 'start-report-generation',
        reason: 'missing',
        requestedAt: '2025-12-31T23:58:00.000Z',
        leaseOwner: 'owner-1',
        leaseExpiresAt: EXPIRED_AT,
        startedAt: '2026-01-01T00:00:30.000Z',
      },
    } as TextIntegrityDataSchema);

    const next = applyRelayRecoveryLeaseData(current, RECOVERY, {
      leaseOwner: 'owner-2',
      requestedAt: NOW,
      leaseExpiresAt: ACTIVE_UNTIL,
      now: NOW,
    });

    expect(next).toBeNull();
  });

  it('plans a local retry without reacquiring when relay started but local processing was not marked', () => {
    const current = runData({
      ...runData().serviceData,
      relayRecovery: {
        phase: 'similarity',
        action: 'start-report-generation',
        reason: 'missing',
        requestedAt: '2025-12-31T23:58:00.000Z',
        leaseOwner: 'owner-1',
        leaseExpiresAt: EXPIRED_AT,
        startedAt: '2026-01-01T00:00:30.000Z',
      },
    } as TextIntegrityDataSchema);

    const plan = planRelayRecoveryData(current, RECOVERY, {
      leaseOwner: 'owner-2',
      requestedAt: NOW,
      leaseExpiresAt: ACTIVE_UNTIL,
      now: NOW,
    });

    expect(plan).toEqual({ action: 'retryLocal', leaseOwner: 'owner-1' });
  });

  it('skips recovery after relay start and local processing were both marked', () => {
    const current = runData({
      ...runData().serviceData,
      relayRecovery: {
        phase: 'similarity',
        action: 'start-report-generation',
        reason: 'missing',
        requestedAt: '2025-12-31T23:58:00.000Z',
        leaseOwner: 'owner-1',
        leaseExpiresAt: EXPIRED_AT,
        startedAt: '2026-01-01T00:00:30.000Z',
        localProcessingStartedAt: '2026-01-01T00:00:31.000Z',
      },
    } as TextIntegrityDataSchema);

    const plan = planRelayRecoveryData(current, RECOVERY, {
      leaseOwner: 'owner-2',
      requestedAt: NOW,
      leaseExpiresAt: ACTIVE_UNTIL,
      now: NOW,
    });

    expect(plan).toEqual({ action: 'skip' });
  });

  it('blocks recovery when post-apply processing state is already active or complete', () => {
    for (const status of ['processing', 'completed', 'notify-skipped'] as const) {
      const current = runData({
        ...runData().serviceData,
        stages: {
          ...runData().serviceData.stages,
          processing: {
            status,
            history: [],
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        },
      } as TextIntegrityDataSchema);

      const next = applyRelayRecoveryLeaseData(current, RECOVERY, {
        leaseOwner: `owner-${status}`,
        requestedAt: NOW,
        leaseExpiresAt: ACTIVE_UNTIL,
        now: NOW,
      });

      expect(next).toBeNull();
    }
  });

  it('only marks recovery started for the current lease owner', () => {
    const current = applyRelayRecoveryLeaseData(runData(), RECOVERY, {
      leaseOwner: 'owner-1',
      requestedAt: NOW,
      leaseExpiresAt: ACTIVE_UNTIL,
      now: NOW,
    });

    expect(markRelayRecoveryStartedData(current, 'owner-2', NOW)).toBeNull();

    const next = markRelayRecoveryStartedData(current, 'owner-1', NOW);
    expect(lease(next?.serviceData)?.startedAt).toBe(NOW.toISOString());
  });

  it('only marks local processing started for the current lease owner', () => {
    const current = applyRelayRecoveryLeaseData(runData(), RECOVERY, {
      leaseOwner: 'owner-1',
      requestedAt: NOW,
      leaseExpiresAt: ACTIVE_UNTIL,
      now: NOW,
    });

    expect(markRelayRecoveryLocalProcessingStartedData(current, 'owner-2', NOW)).toBeNull();

    const next = markRelayRecoveryLocalProcessingStartedData(current, 'owner-1', NOW);
    expect(lease(next?.serviceData)?.localProcessingStartedAt).toBe(NOW.toISOString());
  });
});
