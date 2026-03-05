// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import { nihmsFilesRequestHandler } from './nihms-files-request.server.js';

describe('nihms-files-request handler', () => {
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
        description: 'subject is case-insensitive',
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
});
