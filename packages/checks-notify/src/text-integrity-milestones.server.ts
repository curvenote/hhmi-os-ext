/** Text-integrity webhook events that warrant Slack (terminal outcomes only). */
export const TEXT_INTEGRITY_SLACK_WEBHOOK_EVENTS = new Set([
  'SUBMISSION_FAILED',
  'PROCESSING_PHASE_FAILED',
  'REPORT_GENERATION_FAILED',
  'REPORT_GENERATION_COMPLETE',
]);

export function isTextIntegritySlackWebhookEvent(event: string): boolean {
  return TEXT_INTEGRITY_SLACK_WEBHOOK_EVENTS.has(event);
}

export function textIntegrityWebhookColor(event: string): 'good' | 'warning' | 'danger' {
  if (event.endsWith('_FAILED') || event === 'SUBMISSION_FAILED') return 'danger';
  if (event === 'REPORT_GENERATION_COMPLETE') return 'good';
  return 'good';
}

export function textIntegrityWebhookMessage(
  event: string,
  overallMatchPercentage?: number | null,
): string {
  switch (event) {
    case 'SUBMISSION_FAILED':
      return 'Text integrity submission failed';
    case 'PROCESSING_PHASE_FAILED':
      return 'Text integrity processing failed';
    case 'REPORT_GENERATION_FAILED':
      return 'Text integrity report generation failed';
    case 'REPORT_GENERATION_COMPLETE': {
      const pct =
        overallMatchPercentage != null && !Number.isNaN(overallMatchPercentage)
          ? ` (${overallMatchPercentage}% overall match)`
          : '';
      return `Text integrity report generation complete${pct}`;
    }
    default:
      return `Text integrity event: ${event}`;
  }
}
