import { getConfig } from '@curvenote/scms-server';
import { XMLParser } from 'fast-xml-parser';

/** `initial-submitter` value on NIHMS records deposited by the HHMI Workspace bulk account. */
export const NIHMS_WORKSPACE_SUBMITTER = 'PubMedCentralAlerts HHMI';

const DEFAULT_NIHMS_BASE_URL = 'https://www.nihms.nih.gov';
const NIHMS_FETCH_TIMEOUT_MS = 60_000;

/**
 * One manuscript from the NIHMS Funder Manuscript List API (`format=xml`).
 * Reviewer and PI names/emails are deliberately not mapped.
 */
export type NihmsRecord = {
  nihmsId: string;
  pmid?: string;
  pmcid?: string;
  title: string;
  initialSubmitter?: string;
  currentStatus?: string;
  daysInCurrentStatus?: number;
  submissionDate?: string;
  initialApprovalDate?: string;
  taggingCompletionDate?: string;
  finalApprovalDate?: string;
  articlePublicationDate?: string;
  shipToPmcDate?: string;
  pubmedDate?: string;
  pmcPublishDate?: string;
  journal?: string;
  /** `bulk-submission-id`: the package ID we upload, i.e. our WorkVersion id. */
  packageId?: string;
};

type NihmsApiConfig = {
  username: string;
  password: string;
  baseUrl?: string;
};

async function getNihmsApiConfig(): Promise<NihmsApiConfig> {
  const config = await getConfig();
  const nihmsApi = config.app.extensions?.['pmc']?.nihmsApi;
  if (!nihmsApi?.username || !nihmsApi?.password) {
    throw new Error('PMC NIHMS API credentials are missing. Please update the app-config.');
  }
  return nihmsApi as NihmsApiConfig;
}

export async function isNihmsApiConfigured(): Promise<boolean> {
  try {
    await getNihmsApiConfig();
    return true;
  } catch {
    return false;
  }
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object') return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

function int(value: unknown): number | undefined {
  const s = text(value);
  if (!s) return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Parse the NIHMS `format=xml` report (`<report><records><record>…`) into records.
 * Nested `<funding><record>` elements are ignored.
 */
export function parseNihmsReportXml(xml: string): NihmsRecord[] {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
  const parsed = parser.parse(xml);
  const raw = parsed?.report?.records?.record;
  const list: Record<string, unknown>[] = raw == null ? [] : Array.isArray(raw) ? raw : [raw];

  return list
    .map((r) => ({
      nihmsId: text(r['NIHMSID']) ?? '',
      pmid: text(r['PMID']),
      pmcid: text(r['PMCID']),
      title: text(r['manuscript-title']) ?? '',
      initialSubmitter: text(r['initial-submitter']),
      currentStatus: text(r['current-status']),
      daysInCurrentStatus: int(r['days-in-current-status']),
      submissionDate: text(r['submission-date']),
      initialApprovalDate: text(r['initial-approval-date']),
      taggingCompletionDate: text(r['tagging-completion-date']),
      finalApprovalDate: text(r['final-approval-date']),
      articlePublicationDate: text(r['article-publication-date']),
      shipToPmcDate: text(r['ship-to-pmc-date']),
      pubmedDate: text(r['pubmed-date']),
      pmcPublishDate: text(r['pmc-publish-date']),
      journal: text(r['journal']),
      packageId: text(r['bulk-submission-id']),
    }))
    .filter((r) => r.nihmsId.length > 0);
}

export type NihmsReport = {
  records: NihmsRecord[];
  fetchedAt: string;
  durationMs: number;
};

/**
 * Fetch the full HHMI manuscript report from NIHMS (real-time, unpaginated XML).
 * Never logs record contents, which include personal data.
 */
export async function fetchNihmsReport(): Promise<NihmsReport> {
  const { username, password, baseUrl } = await getNihmsApiConfig();
  const url = `${(baseUrl ?? DEFAULT_NIHMS_BASE_URL).replace(/\/$/, '')}/api/funding/manuscript/?format=xml`;
  const started = Date.now();
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      Accept: 'application/xml',
    },
    signal: AbortSignal.timeout(NIHMS_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`NIHMS API request failed: ${response.status} ${response.statusText}`);
  }
  const xml = await response.text();
  const records = parseNihmsReportXml(xml);
  return { records, fetchedAt: new Date().toISOString(), durationMs: Date.now() - started };
}
