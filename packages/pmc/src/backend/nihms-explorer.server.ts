import { getPrismaClient } from '@curvenote/scms-server';
import { PMC_WORKSPACE_SITE_NAME } from '../workflows.js';
import { PMC_STATUS_LOOKUP } from './jobs/pmc-workflow-sync.js';
import { fetchNihmsReport, NIHMS_WORKSPACE_SUBMITTER } from './nihms-api.server.js';
import {
  correlateNihmsRecords,
  type CorrelatedRecord,
  type WorkspaceVersion,
} from './nihms-correlate.js';

/** Load every PMC submission version, flattened for correlation with NIHMS records. */
export async function loadPmcWorkspaceVersions(): Promise<WorkspaceVersion[]> {
  const prisma = await getPrismaClient();
  const rows = await prisma.submissionVersion.findMany({
    where: { submission: { site: { name: PMC_WORKSPACE_SITE_NAME } } },
    select: {
      id: true,
      submission_id: true,
      status: true,
      date_created: true,
      work_version_id: true,
      metadata: true,
      work_version: { select: { work_id: true, title: true } },
    },
  });

  return rows.map((row) => {
    const manuscriptId = (row.metadata as any)?.pmc?.emailProcessing?.manuscriptId;
    return {
      submissionVersionId: row.id,
      submissionId: row.submission_id,
      status: row.status,
      dateCreated: row.date_created,
      workVersionId: row.work_version_id,
      workId: row.work_version.work_id,
      title: row.work_version.title ?? undefined,
      manuscriptId: typeof manuscriptId === 'string' ? manuscriptId : undefined,
    };
  });
}

export type NihmsExplorerResult = {
  fetchedAt: string;
  durationMs: number;
  /** All records NIHMS returned for the HHMI funding authority. */
  totalRecords: number;
  /** Records deposited by the Workspace bulk account, correlated with our versions. */
  records: CorrelatedRecord[];
};

/** Fetch the live NIHMS report, keep Workspace deposits, and correlate them with our database. */
export async function fetchAndCorrelateNihmsRecords(): Promise<NihmsExplorerResult> {
  const [report, versions] = await Promise.all([fetchNihmsReport(), loadPmcWorkspaceVersions()]);
  const ours = report.records.filter((r) => r.initialSubmitter === NIHMS_WORKSPACE_SUBMITTER);
  return {
    fetchedAt: report.fetchedAt,
    durationMs: report.durationMs,
    totalRecords: report.records.length,
    records: correlateNihmsRecords(ours, versions, PMC_STATUS_LOOKUP),
  };
}
