/**
 * JSON schema for the Proofig notify webhook payload stored in the messages table.
 *
 * This is used for UI rendering (similar to the email message schemas).
 */
export const PROOFIG_NOTIFY_PAYLOAD_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  description: 'Schema for Proofig ready notification (notify_url POST payload).',
  type: 'object',
  properties: {
    submit_req_id: { type: 'string' },
    report_id: { type: 'string' },
    state: {
      type: 'string',
      enum: [
        'Processing',
        'Awaiting: Sub-Image Approval',
        'Awaiting: Review',
        'Report: Clean',
        'Report: Flagged',
        'Deleted',
      ],
    },
    subimages_total: { type: 'integer' },
    matches_review: { type: 'integer' },
    matches_report: { type: 'integer' },
    inspects_report: { type: 'integer' },
    report_url: { type: 'string' },
    number: { type: 'integer' },
    message: { type: 'string' },
  },
  required: [
    'submit_req_id',
    'report_id',
    'state',
    'subimages_total',
    'matches_review',
    'matches_report',
    'inspects_report',
    'report_url',
  ],
  additionalProperties: true,
} as const;

export const PROOFIG_NOTIFY_RESULTS_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  description: 'Schema for Proofig notify processing results stored alongside the payload.',
  type: 'object',
  properties: {
    checkServiceRunId: { type: 'string' },
    receivedAt: { type: 'string', format: 'date-time' },
    processedAt: { type: 'string', format: 'date-time' },
    error: { type: 'string' },
    issues: { type: 'array', items: { type: 'object' } },
  },
  required: ['checkServiceRunId', 'receivedAt'],
  additionalProperties: true,
} as const;
