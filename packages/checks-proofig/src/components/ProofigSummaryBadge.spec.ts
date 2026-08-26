// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { KnownState, type ProofigDataSchema } from '../schema.js';
import { ProofigSummaryBadge } from './ProofigSummaryBadge.js';

const receivedAt = '2026-01-01T00:00:00.000Z';

describe('ProofigSummaryBadge', () => {
  it('shows awaiting review before the in-progress fallback when the outcome is not set yet', () => {
    const badge = ProofigSummaryBadge({
      metadata: {
        stages: {
          resultsReview: {
            status: 'requested',
            history: [],
            timestamp: receivedAt,
          },
        },
      } as unknown as ProofigDataSchema,
    });

    expect(isValidElement(badge)).toBe(true);

    const props = (badge as ReactElement<{ children: string; variant: string }>).props;
    expect(props.children).toBe('Awaiting review');
    expect(props.variant).toBe('warning');
  });

  it('shows the failed stage instead of all clear when results review errored with a stale outcome', () => {
    const badge = ProofigSummaryBadge({
      metadata: {
        summary: {
          state: KnownState.AwaitingReview,
          receivedAt,
          subimagesTotal: 10,
          matchesReview: 2,
          matchesReport: 0,
          inspectsReport: 0,
        },
        stages: {
          initialPost: { status: 'completed', history: [], timestamp: receivedAt },
          subimageDetection: { status: 'completed', history: [], timestamp: receivedAt },
          subimageSelection: { status: 'completed', history: [], timestamp: receivedAt },
          integrityDetection: { status: 'completed', history: [], timestamp: receivedAt },
          resultsReview: {
            status: 'error',
            outcome: 'pending',
            error: 'Review failed',
            history: [],
            timestamp: receivedAt,
          },
        },
      } as unknown as ProofigDataSchema,
    });

    expect(isValidElement(badge)).toBe(true);

    const props = (badge as ReactElement<{ children: string; variant: string }>).props;
    expect(props.children).toBe('Error');
    expect(props.variant).toBe('destructive');
  });
});
