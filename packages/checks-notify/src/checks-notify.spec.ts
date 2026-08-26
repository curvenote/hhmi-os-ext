import { describe, expect, it } from 'vitest';
import { colorForSeverity } from './colors.server.js';
import { shouldNotifyErrorTransition } from './error-transition.server.js';
import {
  isProofigSlackMilestoneState,
  proofigMilestoneMessage,
} from './proofig-milestones.server.js';
import {
  isTextIntegritySlackWebhookEvent,
  textIntegrityWebhookMessage,
} from './text-integrity-milestones.server.js';

describe('colorForSeverity', () => {
  it('maps severities to Slack colors', () => {
    expect(colorForSeverity('success')).toBe('good');
    expect(colorForSeverity('warning')).toBe('warning');
    expect(colorForSeverity('error')).toBe('danger');
  });
});

describe('shouldNotifyErrorTransition', () => {
  it('notifies on healthy to error', () => {
    expect(shouldNotifyErrorTransition('healthy', 'error')).toBe(true);
    expect(shouldNotifyErrorTransition('unknown', 'error')).toBe(true);
    expect(shouldNotifyErrorTransition(null, 'error')).toBe(true);
  });

  it('skips when already error or not entering error', () => {
    expect(shouldNotifyErrorTransition('error', 'error')).toBe(false);
    expect(shouldNotifyErrorTransition('healthy', 'healthy')).toBe(false);
  });
});

describe('proofig milestones', () => {
  it('includes terminal states only', () => {
    expect(isProofigSlackMilestoneState('Report: Flagged')).toBe(true);
    expect(isProofigSlackMilestoneState('Report: Clean')).toBe(true);
    expect(isProofigSlackMilestoneState('Deleted')).toBe(true);
    expect(isProofigSlackMilestoneState('Awaiting: Review')).toBe(false);
    expect(isProofigSlackMilestoneState('Awaiting: Sub-Image Approval')).toBe(false);
    expect(isProofigSlackMilestoneState('Processing')).toBe(false);
  });

  it('builds readable messages', () => {
    expect(proofigMilestoneMessage('Report: Clean', 'r-1')).toContain('clean');
    expect(proofigMilestoneMessage('Report: Clean', 'r-1')).toContain('r-1');
  });
});

describe('text-integrity milestones', () => {
  it('includes terminal failure and completion events only', () => {
    expect(isTextIntegritySlackWebhookEvent('REPORT_GENERATION_COMPLETE')).toBe(true);
    expect(isTextIntegritySlackWebhookEvent('REPORT_GENERATION_FAILED')).toBe(true);
    expect(isTextIntegritySlackWebhookEvent('SUBMISSION_FAILED')).toBe(true);
    expect(isTextIntegritySlackWebhookEvent('PROCESSING_PHASE_COMPLETE')).toBe(false);
    expect(isTextIntegritySlackWebhookEvent('SUBMISSION_COMPLETE')).toBe(false);
    expect(isTextIntegritySlackWebhookEvent('UNKNOWN')).toBe(false);
  });

  it('includes match percentage in report complete message', () => {
    expect(textIntegrityWebhookMessage('REPORT_GENERATION_COMPLETE', 12.5)).toContain('12.5%');
  });
});
