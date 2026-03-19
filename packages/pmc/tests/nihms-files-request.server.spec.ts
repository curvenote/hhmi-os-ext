// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmailProcessorConfig } from '../src/backend/email/types.server.js';

const {
  mockGetPrismaClient,
  mockUpdateMessageStatus,
  mockUpdateSubmissionMetadataAndStatusIfChanged,
  mockUpdateSubmissionStatusOnReceivingEmail,
  mockGetEmailTemplates,
} = vi.hoisted(() => ({
  mockGetPrismaClient: vi.fn(),
  mockUpdateMessageStatus: vi.fn(),
  mockUpdateSubmissionMetadataAndStatusIfChanged: vi.fn(),
  mockUpdateSubmissionStatusOnReceivingEmail: vi.fn(),
  mockGetEmailTemplates: vi.fn(() => ({ mocked: true })),
}));

vi.mock('@curvenote/scms-server', () => ({
  getPrismaClient: mockGetPrismaClient,
}));

vi.mock('../src/backend/email/email-db.server.js', () => ({
  updateMessageStatus: mockUpdateMessageStatus,
  updateSubmissionMetadataAndStatusIfChanged: mockUpdateSubmissionMetadataAndStatusIfChanged,
  updateSubmissionStatusOnReceivingEmail: mockUpdateSubmissionStatusOnReceivingEmail,
}));

vi.mock('../src/client.js', () => ({
  getEmailTemplates: mockGetEmailTemplates,
}));

vi.mock('../src/backend/emails/nihms-files-requested.js', () => ({
  PMC_NIHMS_FILES_REQUESTED: 'PMC_NIHMS_FILES_REQUESTED',
}));

import {
  nihmsFilesRequestHandler,
  parseFilesRequestEmail,
} from '../src/backend/email/handlers/nihms-files-request.server.js';

describe('nihms-files-request handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('identify', () => {
    it.each<{
      payload: { headers?: { subject?: string }; [key: string]: unknown };
      expected: boolean;
      description: string;
    }>([
      // Recognized: "please upload" before "to nihms"
      {
        payload: {
          headers: { subject: 'Please upload missing file(s) to NIHMS' },
        },
        expected: true,
        description: 'Real-world example from NIHMS files request email',
      },
      {
        payload: {
          headers: { subject: 'Please upload missing MDAR Reproducibility Checklist to NIHMS' },
        },
        expected: true,
        description: 'Real-world example from NIHMS files request email',
      },
      {
        payload: {
          headers: { subject: 'Please upload missing supplementary material to NIHMS' },
        },
        expected: true,
        description: 'Real-world example from NIHMS files request email',
      },
      {
        payload: {
          headers: { subject: 'Please upload missing figure to NIHMS' },
        },
        expected: true,
        description: 'Real-world example from NIHMS files request email',
      },
      {
        payload: {
          headers: { subject: 'Please upload missing Tables S1-S30 to NIHMS' },
        },
        expected: true,
        description: 'Real-world example from NIHMS files request email',
      },
      {
        payload: {
          headers: { subject: 'Please upload missing Extended Data figure captions to NIHMS' },
        },
        expected: true,
        description: 'Real-world example from NIHMS files request email - extended data captions',
      },
      {
        payload: { headers: { subject: 'Please upload additional files to NIHMS' } },
        expected: true,
        description: 'subject with "Please upload ... to NIHMS"',
      },
      {
        payload: {
          headers: { subject: 'Please upload supplementary materials to NIHMS for review' },
        },
        expected: true,
        description: 'subject with extra text after "to NIHMS"',
      },
      {
        payload: {
          headers: { subject: 'PLEASE UPLOAD files TO NIHMS' },
        },
        expected: true,
        description: 'subject is case-insensitive (all caps keywords)',
      },
      {
        payload: {
          headers: { subject: 'please upload missing file(s) to Nihms' },
        },
        expected: true,
        description: 'subject is case-insensitive (lowercase/title-case mix)',
      },
      {
        payload: {
          envelope: { from: 'other@example.com' },
          headers: { subject: 'Please upload additional files to NIHMS' },
        },
        expected: true,
        description: 'identifies regardless of envelope/sender',
      },
      {
        payload: {
          headers: { subject: 'Re: Please upload files to NIHMS' },
        },
        expected: true,
        description: 'subject with Re: prefix still matches',
      },
      // Rejected: missing or wrong structure
      {
        payload: {},
        expected: false,
        description: 'no headers',
      },
      {
        payload: { headers: {} },
        expected: false,
        description: 'headers but no subject',
      },
      {
        payload: { headers: { subject: '' } },
        expected: false,
        description: 'empty subject',
      },
      {
        payload: { headers: { subject: 'To NIHMS please upload files' } },
        expected: false,
        description: '"to nihms" before "please upload"',
      },
      {
        payload: { headers: { subject: 'Please upload something' } },
        expected: false,
        description: '"please upload" without "to nihms"',
      },
      {
        payload: { headers: { subject: 'To NIHMS only' } },
        expected: false,
        description: '"to nihms" without "please upload"',
      },
      {
        payload: { headers: { subject: 'Unrelated subject line' } },
        expected: false,
        description: 'subject with no matching phrases',
      },
    ])('$description', ({ payload, expected }) => {
      expect(nihmsFilesRequestHandler.identify(payload)).toBe(expected);
    });
  });

  describe('validate', () => {
    const validSubject = 'Please upload missing file(s) to NIHMS';
    const config: EmailProcessorConfig = { subjectPatterns: [], enabled: true };

    it('accepts email with standard greeting', () => {
      const payload = {
        headers: { subject: validSubject },
        plain:
          'Dear Howard Hughes Medical Institute,\n\nThe files are missing.\n\nTo access the manuscript record, please log in.',
      };
      expect(nihmsFilesRequestHandler.validate(payload, config)).toEqual({ isValid: true });
    });

    it('accepts email with "Dear Dr." greeting', () => {
      const payload = {
        headers: { subject: validSubject },
        plain:
          'Dear Dr. Howard Hughes Medical Institute,\n\nThe captions are missing.\n\nTo access the manuscript record, please log in.',
      };
      expect(nihmsFilesRequestHandler.validate(payload, config)).toEqual({ isValid: true });
    });

    it('accepts HTML-only email content', () => {
      const payload = {
        headers: { subject: validSubject },
        html: '<p>Dear Howard Hughes Medical Institute,</p><p>The files are missing.</p><p>To access the manuscript record, please log in.</p>',
      };
      expect(nihmsFilesRequestHandler.validate(payload, config)).toEqual({ isValid: true });
    });

    it('rejects email missing required subject field', () => {
      const payload = {
        plain:
          'Dear Howard Hughes Medical Institute,\n\nThe files are missing.\n\nTo access the manuscript record, please log in.',
      };
      const result = nihmsFilesRequestHandler.validate(payload, config);
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/headers\.subject/i);
    });

    it('rejects email when subject does not contain "please upload"', () => {
      const payload = {
        headers: { subject: 'Send additional files to NIHMS' },
        plain:
          'Dear Howard Hughes Medical Institute,\n\nThe files are missing.\n\nTo access the manuscript record, please log in.',
      };
      const result = nihmsFilesRequestHandler.validate(payload, config);
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/please upload/i);
    });

    it('rejects email when subject does not contain "to NIHMS"', () => {
      const payload = {
        headers: { subject: 'Please upload additional files' },
        plain:
          'Dear Howard Hughes Medical Institute,\n\nThe files are missing.\n\nTo access the manuscript record, please log in.',
      };
      const result = nihmsFilesRequestHandler.validate(payload, config);
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/to NIHMS/i);
    });

    it('rejects email with no body content', () => {
      const payload = {
        headers: { subject: validSubject },
        plain: '',
        html: '',
      };
      const result = nihmsFilesRequestHandler.validate(payload, config);
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/no content/i);
    });

    it('accepts email that lacks the HHMI greeting marker but has content', () => {
      const payload = {
        headers: { subject: validSubject },
        plain: 'Some unrelated email body.\n\nTo access the manuscript record, please log in.',
      };
      expect(nihmsFilesRequestHandler.validate(payload, config)).toEqual({ isValid: true });
    });

    it('accepts email that lacks the end marker but has content', () => {
      const payload = {
        headers: { subject: validSubject },
        plain: 'Dear Howard Hughes Medical Institute,\n\nThe files are missing.',
      };
      expect(nihmsFilesRequestHandler.validate(payload, config)).toEqual({ isValid: true });
    });
  });

  describe('parseFilesRequestEmail', () => {
    const defaultPayload = (plain: string, subject = 'Please upload missing file(s) to NIHMS') => ({
      envelope: { from: 'nihms@nih.gov' },
      headers: { subject },
      plain,
    });

    it.each([
      { greeting: 'Dear Howard Hughes Medical Institute,', desc: 'standard greeting' },
      { greeting: 'Dear Dr. Howard Hughes Medical Institute,', desc: '"Dear Dr." greeting' },
      { greeting: 'Dear Prof. Howard Hughes Medical Institute,', desc: '"Dear Prof." greeting' },
      { greeting: 'Howard Hughes Medical Institute,', desc: 'no salutation prefix' },
      {
        greeting: 'To: Howard Hughes Medical Institute,',
        desc: 'unexpected prefix before HHMI',
      },
    ])('parses message content with $desc', ({ greeting }) => {
      const plain = `(NIHMS2109555)\n\n${greeting}\n\nThe files are missing from the submission.\n\nTo access the manuscript record, please log in.`;
      const result = parseFilesRequestEmail(defaultPayload(plain));
      expect(result.from).toBe('nihms@nih.gov');
      expect(result.subject).toBe('Please upload missing file(s) to NIHMS');
      expect(result.cleanSubject).toBe('Please upload missing file(s) to NIHMS');
      expect(result.manuscriptId).toBe('2109555');
      expect(result.message).toContain('Please upload missing file(s) to NIHMS');
      expect(result.message).toContain('The files are missing from the submission.');
      expect(result.message).not.toContain('To access the manuscript record');
      expect(result.message).not.toContain('Howard Hughes Medical Institute');
    });

    it('falls back to FALLBACK_MESSAGE when greeting marker is missing', () => {
      const plain = '(NIHMS2109555)\n\nSome other greeting.\n\nTo access the manuscript record.';
      const result = parseFilesRequestEmail(defaultPayload(plain));
      expect(result.manuscriptId).toBe('2109555');
      expect(result.message).toContain('Please upload missing file(s) to NIHMS');
      expect(result.message).toContain('We could not determine the reason');
      expect(result.message).not.toContain('Some other greeting');
    });

    it('strips chained reply/forward prefixes and HTML entities from cleanSubject', () => {
      const plain =
        '(NIHMS2109555)\n\nDear Howard Hughes Medical Institute,\n\nThe files are missing.\n\nTo access the manuscript record.';
      const result = parseFilesRequestEmail(
        defaultPayload(plain, 'Re: Fwd: Please upload &amp; verify <b>files</b> to NIHMS'),
      );
      expect(result.cleanSubject).toBe('Please upload & verify files to NIHMS');
    });

    it('uses html content when plain text is not available', () => {
      const payload = {
        envelope: { from: 'nihms@nih.gov' },
        headers: { subject: 'Please upload missing file(s) to NIHMS' },
        html: '<p>(NIHMS2109555)</p>\n<p>Dear Howard Hughes Medical Institute,</p>\n<p>The <b>files</b> are missing &amp; need upload.</p>\n<p>To access the manuscript record, please log in.</p>',
      };
      const result = parseFilesRequestEmail(payload);
      expect(result.manuscriptId).toBe('2109555');
      expect(result.message).toContain('The files are missing & need upload.');
      expect(result.message).not.toContain('<b>');
    });

    it('defaults missing envelope/subject values safely', () => {
      const result = parseFilesRequestEmail({ plain: 'No markers here.' });
      expect(result.from).toBe('unknown');
      expect(result.subject).toBe('no subject');
      expect(result.cleanSubject).toBe('no subject');
      expect(result.message).toContain('no subject');
      expect(result.message).toContain('We could not determine the reason');
    });

    it('stops parsed body after NIHMS "moved back" sentence (production extended data captions forward)', () => {
      const subject = 'Please upload missing Extended Data figure captions to NIHMS';
      const plain = `---------- Forwarded message ---------
From: nihms-help via HHMI PMC Deposits <hhmi-pmc-deposit@curvenote.com>

External Email: Use Caution

"A druggable redox switch on SHP1 controls macrophage inflammation"
(NIHMS2150669)

Dear Dr. Howard Hughes Medical Institute,

The captions for the Extended Data Figure captions are missing from the
above-listed manuscript. We are, therefore, unable to proceed with the
processing of this submission for PubMed Central at this time.

We have moved the manuscript back to a state where you can upload files. To
access the manuscript record, please log in to
https://urldefense.com/v3/__https://www.nihms.nih.gov/__;!!Eh6p8Q!BKZDqRKkjk5IRx3mjtFgxXKkfanHnMouZppWOCqTW-EDFf1rSKr-uqLyLZu2TB9Q20RW1dMgWrRb5ra3AHKYhRlZrV45JQ$

and click on the manuscript title in the Needs Your Attention filter of
your manuscript list.

Thank you,

The NIHMS Team
NTCSR5`;

      const result = parseFilesRequestEmail(defaultPayload(plain, subject));
      expect(result.manuscriptId).toBe('2150669');
      expect(result.message).toContain(subject);
      expect(result.message).toContain(
        'The captions for the Extended Data Figure captions are missing from the',
      );
      expect(result.message).toContain(
        'We have moved the manuscript back to a state where you can upload files.',
      );
      expect(result.message).not.toContain('To access the manuscript record');
      expect(result.message).not.toContain('urldefense.com');
      expect(result.message).not.toContain('Thank you');
      expect(result.message).not.toContain('NTCSR5');
    });

    it('strips http(s), mailto, www., and markdown links from the parsed excerpt', () => {
      const plain = `(NIHMS2109555)

Dear Howard Hughes Medical Institute,

The files are missing. For reference see https://urldefense.com/v3/__https://www.nihms.nih.gov/__;!!foo$
Also visit www.nihms.nih.gov or mailto:support@nih.gov and read [more](https://example.com/path).

We have moved the manuscript back to a state where you can upload files.`;

      const result = parseFilesRequestEmail(defaultPayload(plain));
      expect(result.message).toContain('The files are missing');
      expect(result.message).toContain('We have moved the manuscript back');
      expect(result.message).not.toMatch(/https?:\/\//);
      expect(result.message).not.toContain('urldefense.com');
      expect(result.message).not.toContain('www.nihms');
      expect(result.message).not.toContain('mailto:');
      expect(result.message).not.toContain('example.com');
      expect(result.message).toContain('more');
    });

    it('strips link hrefs from HTML body in the parsed excerpt', () => {
      const payload = {
        envelope: { from: 'nihms@nih.gov' },
        headers: { subject: 'Please upload missing file(s) to NIHMS' },
        html: `<p>(NIHMS2109555)</p>
<p>Dear Howard Hughes Medical Institute,</p>
<p>The files are missing. Link: <a href="https://malicious.example/phish">click here</a>.</p>
<p>We have moved the manuscript back to a state where you can upload files.</p>`,
      };
      const result = parseFilesRequestEmail(payload);
      expect(result.message).toContain('The files are missing');
      expect(result.message).not.toContain('malicious.example');
      expect(result.message).not.toMatch(/https?:\/\//);
    });
  });

  describe('process', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    const messageId = 'message-123';

    const buildPayload = (plain: string) => ({
      envelope: { from: 'nihms@nih.gov' },
      headers: { subject: 'Please upload missing file(s) to NIHMS' },
      plain,
    });

    const buildCtx = (overrides: Record<string, unknown> = {}) =>
      ({
        sendEmail: vi.fn().mockResolvedValue(undefined),
        asBaseUrl: vi.fn((path: string) => `https://workspace.example${path}`),
        $config: { app: { supportEmail: 'support@example.org' } },
        ...overrides,
      }) as any;

    const buildPrisma = () => ({
      submissionVersion: {
        findFirst: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    });

    it('returns IGNORED and updates message status when manuscript ID is missing', async () => {
      const ctx = buildCtx();
      const payload = buildPayload(
        'Dear Howard Hughes Medical Institute,\n\nMissing files.\n\nTo access the manuscript record.',
      );

      const result = await nihmsFilesRequestHandler.process(ctx, payload, messageId);

      expect(result.status).toBe('IGNORED');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toEqual(['No NIHMS manuscript ID found in email content.']);
      expect(mockUpdateMessageStatus).toHaveBeenCalledTimes(1);
      expect(mockUpdateMessageStatus).toHaveBeenCalledWith(
        ctx,
        messageId,
        'IGNORED',
        expect.objectContaining({
          processor: 'nihms-files-request',
          reason: 'No NIHMS manuscript ID found in email content',
        }),
      );
      expect(mockGetPrismaClient).not.toHaveBeenCalled();
    });

    it('returns IGNORED when manuscript ID exists but no matching submission is found', async () => {
      const ctx = buildCtx();
      const prisma = buildPrisma();
      prisma.submissionVersion.findFirst.mockResolvedValue(null);
      mockGetPrismaClient.mockResolvedValue(prisma);

      const payload = buildPayload(
        '(NIHMS2109555)\n\nDear Howard Hughes Medical Institute,\n\nMissing files.\n\nTo access the manuscript record.',
      );

      const result = await nihmsFilesRequestHandler.process(ctx, payload, messageId);

      expect(result.status).toBe('IGNORED');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toEqual(['No submission found for NIHMS manuscript ID: 2109555']);
      expect(prisma.submissionVersion.findFirst).toHaveBeenCalledTimes(1);
      expect(mockUpdateMessageStatus).toHaveBeenCalledWith(
        ctx,
        messageId,
        'IGNORED',
        expect.objectContaining({
          manuscriptId: '2109555',
        }),
      );
    });

    it('returns SUCCESS and sends submitter notification when submission is found', async () => {
      const ctx = buildCtx();
      const prisma = buildPrisma();
      prisma.submissionVersion.findFirst.mockResolvedValue({
        id: 'submission-version-1',
        work_version_id: 'work-version-1',
        submitted_by_id: 'user-1',
        status: 'SUBMITTERS_FILES_REQUESTED',
        work_version: { work_id: 'work-1' },
      });
      prisma.user.findUnique.mockResolvedValue({
        email: 'submitter@example.org',
        display_name: 'Submitter Name',
      });
      mockGetPrismaClient.mockResolvedValue(prisma);
      mockUpdateSubmissionMetadataAndStatusIfChanged.mockResolvedValue(true);

      const payload = buildPayload(
        '(NIHMS2109555)\n\nDear Howard Hughes Medical Institute,\n\nThe files are missing from the submission.\n\nTo access the manuscript record, please log in.',
      );

      const result = await nihmsFilesRequestHandler.process(ctx, payload, messageId);

      expect(result.status).toBe('SUCCESS');
      expect(result.processedDeposits).toBe(1);
      expect(mockUpdateSubmissionMetadataAndStatusIfChanged).toHaveBeenCalledWith(
        ctx,
        'work-version-1',
        expect.objectContaining({
          packageId: 'work-version-1',
          manuscriptId: '2109555',
          status: 'warning',
          message: expect.stringContaining('Please upload missing file(s) to NIHMS'),
        }),
        messageId,
        'SUBMITTERS_FILES_REQUESTED',
        'nihms-files-request',
      );
      expect(ctx.sendEmail).toHaveBeenCalledTimes(1);
      expect(ctx.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'PMC_NIHMS_FILES_REQUESTED',
          to: 'submitter@example.org',
          subject: 'NIHMS Files Requested for 2109555',
        }),
        { mocked: true },
      );
      expect(mockUpdateSubmissionStatusOnReceivingEmail).toHaveBeenCalledWith(
        ctx,
        'work-version-1',
        'REQUEST_NEW_VERSION',
      );
    });

    it('skips status update when submission is already REQUEST_NEW_VERSION', async () => {
      const ctx = buildCtx();
      const prisma = buildPrisma();
      prisma.submissionVersion.findFirst.mockResolvedValue({
        id: 'submission-version-1',
        work_version_id: 'work-version-1',
        submitted_by_id: 'user-1',
        status: 'REQUEST_NEW_VERSION',
        work_version: { work_id: 'work-1' },
      });
      prisma.user.findUnique.mockResolvedValue({
        email: 'submitter@example.org',
        display_name: 'Submitter Name',
      });
      mockGetPrismaClient.mockResolvedValue(prisma);
      mockUpdateSubmissionMetadataAndStatusIfChanged.mockResolvedValue(true);

      const payload = buildPayload(
        '(NIHMS2109555)\n\nDear Howard Hughes Medical Institute,\n\nThe files are missing from the submission.\n\nTo access the manuscript record, please log in.',
      );

      const result = await nihmsFilesRequestHandler.process(ctx, payload, messageId);

      expect(result.status).toBe('SUCCESS');
      expect(mockUpdateSubmissionStatusOnReceivingEmail).not.toHaveBeenCalled();
    });

    it('sends support notification when submitter email is missing and metadata changed', async () => {
      const ctx = buildCtx();
      const prisma = buildPrisma();
      prisma.submissionVersion.findFirst.mockResolvedValue({
        id: 'submission-version-1',
        work_version_id: 'work-version-1',
        submitted_by_id: 'user-1',
        status: 'SUBMITTERS_FILES_REQUESTED',
        work_version: { work_id: 'work-1' },
      });
      prisma.user.findUnique.mockResolvedValue({ email: null, display_name: 'Submitter Name' });
      mockGetPrismaClient.mockResolvedValue(prisma);
      mockUpdateSubmissionMetadataAndStatusIfChanged.mockResolvedValue(true);

      const payload = buildPayload(
        '(NIHMS2109555)\n\nDear Howard Hughes Medical Institute,\n\nThe files are missing from the submission.\n\nTo access the manuscript record, please log in.',
      );

      const result = await nihmsFilesRequestHandler.process(ctx, payload, messageId);

      expect(result.status).toBe('SUCCESS');
      expect(ctx.sendEmail).toHaveBeenCalledTimes(1);
      expect(ctx.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'support@example.org',
          subject: 'NIHMS Files Request Received but Email Not Sent to Submitter',
        }),
        { mocked: true },
      );
    });

    it('returns ERROR if processing throws unexpectedly', async () => {
      const ctx = buildCtx();
      mockGetPrismaClient.mockRejectedValue(new Error('Database unavailable'));

      const payload = buildPayload(
        '(NIHMS2109555)\n\nDear Howard Hughes Medical Institute,\n\nThe files are missing from the submission.\n\nTo access the manuscript record, please log in.',
      );

      const result = await nihmsFilesRequestHandler.process(ctx, payload, messageId);

      expect(result.status).toBe('ERROR');
      expect(result.processedDeposits).toBe(0);
      expect(result.errors).toContain('Database unavailable');
    });
  });
});
