// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import { parseNihmsReportXml } from '../src/backend/nihms-api.server.js';

// Shape matches the NIHMS Funder Manuscript List API `format=xml` response; values are invented.
const record = (nihmsId: string, extra = '') => `
    <record>
      <NIHMSID>${nihmsId}</NIHMSID>
      <PMID/>
      <PMCID/>
      <manuscript-title>Example manuscript ${nihmsId}</manuscript-title>
      <initial-submitter>PubMedCentralAlerts HHMI</initial-submitter>
      <current-reviewing-author-pi>Ada Example</current-reviewing-author-pi>
      <reviewer-emails>ada@example.org</reviewer-emails>
      <current-status>NIHMS Submission Review and File Preparation</current-status>
      <days-in-current-status>3</days-in-current-status>
      <submission-date>2026-09-30 00:18:52</submission-date>
      <initial-approval-date>2026-09-30 00:37:09</initial-approval-date>
      <tagging-completion-date/>
      <journal>Journal of Examples</journal>
      <bulk-submission-id>01a0ef8b-6918-7689-8644-0ed9f41562f9</bulk-submission-id>
      <agency-custom type="HHMI"/>
      <funding>
        <record>
          <source>hhmi</source>
          <external_id>HHMI_Example_A</external_id>
          <number>HHMI_Example_A</number>
        </record>
      </funding>
      ${extra}
    </record>`;

const report = (...records: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?><report><records>${records.join('')}</records></report>`;

describe('parseNihmsReportXml', () => {
  it('maps record fields, keeping IDs as strings', () => {
    const [r] = parseNihmsReportXml(report(record('2213692')));
    expect(r).toMatchObject({
      nihmsId: '2213692',
      title: 'Example manuscript 2213692',
      initialSubmitter: 'PubMedCentralAlerts HHMI',
      currentStatus: 'NIHMS Submission Review and File Preparation',
      daysInCurrentStatus: 3,
      submissionDate: '2026-09-30 00:18:52',
      initialApprovalDate: '2026-09-30 00:37:09',
      journal: 'Journal of Examples',
      packageId: '01a0ef8b-6918-7689-8644-0ed9f41562f9',
    });
  });

  it('treats empty elements as missing', () => {
    const [r] = parseNihmsReportXml(report(record('1')));
    expect(r.pmid).toBeUndefined();
    expect(r.pmcid).toBeUndefined();
    expect(r.taggingCompletionDate).toBeUndefined();
  });

  it('does not map reviewer or PI personal data', () => {
    const [r] = parseNihmsReportXml(report(record('1')));
    expect(JSON.stringify(r)).not.toContain('ada@example.org');
    expect(JSON.stringify(r)).not.toContain('Ada Example');
  });

  it('returns one record per top-level record, ignoring nested funding records', () => {
    const records = parseNihmsReportXml(report(record('3'), record('2'), record('1')));
    expect(records.map((r) => r.nihmsId)).toEqual(['3', '2', '1']);
  });

  it('handles a single record (not parsed as an array)', () => {
    expect(parseNihmsReportXml(report(record('42')))).toHaveLength(1);
  });

  it('handles an empty report', () => {
    expect(parseNihmsReportXml(report())).toEqual([]);
    expect(parseNihmsReportXml('<report><records/></report>')).toEqual([]);
  });

  it('keeps leading zeros and long numeric IDs intact', () => {
    const [r] = parseNihmsReportXml(report(record('0012345678901234567890')));
    expect(r.nihmsId).toBe('0012345678901234567890');
  });
});
