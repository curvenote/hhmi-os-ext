import { z } from 'zod';
import type { Context, CreateJob, WorkflowTransition } from '@curvenote/scms-core';
import {
  File,
  StorageBackend,
  getPrismaClient,
  validate,
  jobs,
  $updateSubmissionVersion,
  SlackEventType,
  createHandshakeToken,
} from '@curvenote/scms-server';
import {
  coerceToObject,
  httpError,
  ErrorWithObject,
  generateUniqueFileLabel,
  asSiteSubmissionUrl,
} from '@curvenote/scms-core';
import type { KnownBuckets } from '@curvenote/scms-server';
import { JobStatus } from '@curvenote/scms-db';
import type { AAMDepositManifest } from 'pmc-utils';
import { PubSub } from '@google-cloud/pubsub';
import JOURNAL_INFO from '../../data/J_Entrez.json';
import type { JournalInfo, JournalInfoFile } from './types.js';
import { PMC_STATE_NAMES, PMC_WORKSPACE_SITE_NAME } from '../../workflows.js';
import type { PMCWorkVersionMetadata } from '../../common/validate.js';

async function getWorkVersionFromSubmissionVersion(submissionVersionId: string) {
  const prisma = await getPrismaClient();
  const submissionVersion = await prisma.submissionVersion.findUnique({
    where: { id: submissionVersionId },
    include: {
      work_version: {
        include: {
          work: true,
        },
      },
    },
  });

  if (!submissionVersion) {
    throw new Error(`Submission version ${submissionVersionId} not found`);
  }

  if (!submissionVersion.work_version) {
    throw new Error(`No work version found for submission version ${submissionVersionId}`);
  }

  return {
    workVersion: submissionVersion.work_version,
    submissionId: submissionVersion.submission_id,
  };
}

export function getJournalInfo(
  journalInfoList: JournalInfo[],
  pmc: {
    journalName?: string;
    issn?: string;
    issnType?: 'print' | 'electronic';
  },
): AAMDepositManifest['metadata']['journal'] {
  const { journalName, issn, issnType } = pmc;
  // Normalize ISSN (remove dashes, uppercase)
  const normalizeIssn = (value?: string) =>
    value ? value.replace(/-/g, '').toUpperCase() : undefined;

  // Try ISSN lookup first if present
  if (issn && issnType) {
    const normIssn = normalizeIssn(issn);
    const journalInfo = journalInfoList.find((journal: JournalInfo) => {
      const candidateIssn = issnType === 'print' ? journal.pissn : journal.eissn;
      return candidateIssn && normalizeIssn(candidateIssn) === normIssn;
    });
    if (journalInfo) {
      // Check for case-insensitive name match
      if (
        journalName &&
        journalInfo.journalTitle.trim().toLowerCase() !== journalName.trim().toLowerCase()
      ) {
        // Log warning but continue
        console.warn(
          `PMC Deposit: ISSN match found but journal name differs. Metadata: '${journalName}', List: '${journalInfo.journalTitle}'`,
        );
      }
      const matchedIssn = issnType === 'print' ? journalInfo.pissn : journalInfo.eissn;
      return {
        issn: matchedIssn!,
        issnType,
        title: journalName || 'Unknown Journal',
      };
    }
  }

  // Fallback: case-insensitive, trimmed journal name match
  if (journalName) {
    const journalInfo = journalInfoList.find(
      (journal: JournalInfo) =>
        journal.journalTitle.trim().toLowerCase() === journalName.trim().toLowerCase(),
    );
    if (journalInfo) {
      const matchedIssn = journalInfo.pissn || journalInfo.eissn;
      if (!matchedIssn) {
        throw new Error(`No ISSN found for journal ${journalName}`);
      }
      return {
        issn: matchedIssn,
        issnType: journalInfo.pissn ? 'print' : 'electronic',
        title: journalName || 'Unknown Journal',
      };
    }
  }

  // No match found
  throw new Error(`Journal info not found for ${journalName || issn || 'unknown'}`);
}

export async function buildAAMDepositManifest(
  taskId: string,
  agency: string,
  metadata: PMCWorkVersionMetadata,
  storageBackend: StorageBackend,
  sourceBucket: KnownBuckets,
): Promise<AAMDepositManifest> {
  const { pmc, files = {} } = metadata;

  if (!pmc) throw new Error('PMC metadata not found');
  if (!pmc.ownerFirstName || !pmc.ownerLastName) throw new Error('Owner name is required');
  if (!pmc.ownerEmail) throw new Error('Owner email is required');
  if (!pmc.title) throw new Error('Title is required');
  if (!pmc.journalName) {
    throw new Error('Journal name is required');
  }

  // Collect all existing labels for uniqueness checking
  const existingLabels = new Set<string>();
  Object.values(files).forEach((file) => {
    if (file.label) {
      existingLabels.add(file.label);
    }
  });

  // Map files to manifest format
  const manifestFiles = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Object.entries(files).map(async ([_, file]) => {
      let type: 'manuscript' | 'figure' | 'table' | 'supplement';
      switch (file.slot) {
        case 'pmc/manuscript':
          type = 'manuscript';
          break;
        case 'pmc/figures':
          type = 'figure';
          break;
        case 'pmc/tables':
          type = 'table';
          break;
        case 'pmc/videos':
        case 'pmc/supplementary':
          type = 'supplement';
          break;
        default:
          type = 'supplement';
      }

      // Create signed URL for the file
      const fileObj = new File(storageBackend, file.path, sourceBucket);
      const signedUrl = await fileObj.url();

      // Transform the filename to extract slot name and filename, replacing slashes with hyphens
      // Input format: UUID/PMC/slot_name/file_name.extension
      // Output format: slot_name-file_name.extension
      const transformedFilename = file.path.split('/').slice(-1).join(''); // Get last two parts (slot_name and file_name.extension)

      // Handle undefined labels with fallback logic
      let label = file.label;
      if (!label || label.trim() === '') {
        // Extract filename from path for label generation
        const filename = file.path.split('/').pop() || file.name;
        const autoGeneratedLabel = generateUniqueFileLabel(filename, existingLabels);

        console.warn(
          `PMC Deposit: Missing label for file in slot "${file.slot}" (${filename}). Auto-generated label: "${autoGeneratedLabel}"`,
        );

        label = autoGeneratedLabel;
        existingLabels.add(autoGeneratedLabel); // Add to set to maintain uniqueness
      }

      return {
        filename: transformedFilename,
        type,
        path: signedUrl,
        label,
        storage: 'bucket' as const,
        contentType: file.type,
      };
    }),
  );

  // Filter out any null entries (like license files)
  const filteredFiles = manifestFiles.filter(
    (file): file is NonNullable<typeof file> => file !== null,
  );

  // Ensure unique filenames across the manifest
  const seenFilenames = new Set<string>();
  const filesWithUniqueNames = filteredFiles.map((file) => {
    let uniqueFilename = file.filename;
    let counter = 1;

    // If filename already exists, append a counter
    while (seenFilenames.has(uniqueFilename)) {
      const nameWithoutExt = uniqueFilename.replace(/\.[^/.]+$/, '');
      const extension = uniqueFilename.match(/\.[^/.]+$/)?.[0] || '';
      uniqueFilename = `${nameWithoutExt}_${counter}${extension}`;
      counter++;
    }

    seenFilenames.add(uniqueFilename);

    return {
      ...file,
      filename: uniqueFilename,
    };
  });

  const manifest: AAMDepositManifest = {
    taskId,
    agency,
    files: filesWithUniqueNames,
    metadata: {
      title: pmc.title,
      journal: getJournalInfo((JOURNAL_INFO as JournalInfoFile).items, pmc),
      authors: [
        pmc.designateReviewer
          ? {
              fname: pmc.reviewerFirstName as string,
              lname: pmc.reviewerLastName as string,
              email: pmc.reviewerEmail as string,
              contactType: 'reviewer' as const,
            }
          : {
              fname: pmc.ownerFirstName,
              lname: pmc.ownerLastName,
              email: pmc.ownerEmail,
              contactType: 'reviewer' as const,
            },
      ],
      grants: (pmc.grants || []).map((grant) => ({
        funder: grant.funderKey,
        id: grant.grantId,
      })),
    },
  };

  if (pmc.doiUrl) {
    manifest.doi = pmc.doiUrl;
  }

  return manifest;
}

export const CreatePmcDepositFtpJobPayloadSchema = z.object({
  agency: z.enum(['nih', 'acl', 'ahrq', 'cdc', 'fda', 'aspr', 'epa', 'nist', 'dhs', 'va', 'hhmi']),
  site_id: z.uuid(),
  user_id: z.string(),
  submission_version_id: z.uuid(),
});

export async function pmcDepositHandler(ctx: Context, data: CreateJob) {
  const rollingLog: { message: string; data: any }[] = [];

  console.log('pmcDepositHandler', data);
  const job = await jobs.dbStartJob({
    ...data,
    status: JobStatus.RUNNING,
    results: { ...data.results },
  });
  rollingLog.push({ message: 'job created', data: job });

  const { submission_version_id, agency, user_id } = validate(
    CreatePmcDepositFtpJobPayloadSchema,
    data.payload,
  );
  rollingLog.push({
    message: 'payload validated',
    data: { submission_version_id, agency, user_id },
  });

  // Work version + submission id (for Slack on failure without an extra DB round-trip)
  const { workVersion, submissionId } =
    await getWorkVersionFromSubmissionVersion(submission_version_id);
  if (!workVersion.metadata) {
    throw new Error(`No metadata found for work version ${workVersion.id}`);
  }

  if (!workVersion.cdn) {
    throw new Error(`No CDN found for work version ${workVersion.id}`);
  }
  rollingLog.push({ message: 'workVersion CDN', data: workVersion.cdn });

  // Create storage backend for signed URLs
  const storageBackend = new StorageBackend(ctx);
  const sourceBucket = storageBackend.knownBucketFromCDN(workVersion.cdn);
  if (!sourceBucket) throw new Error('Invalid source bucket');
  storageBackend.ensureConnection(sourceBucket);
  rollingLog.push({ message: 'storageBackend ensured connection', data: sourceBucket });

  let attributes: Record<string, string> | undefined;
  let manifest: AAMDepositManifest | undefined;
  try {
    manifest = await buildAAMDepositManifest(
      workVersion.id, // this would mean strictly 1 deposit per work version, saves a taskId write back to the database
      agency, // agency - any funder
      workVersion.metadata as PMCWorkVersionMetadata,
      storageBackend,
      sourceBucket,
    );
    rollingLog.push({ message: 'manifest built', data: manifest });

    const depositService = ctx.$config.app.extensions?.pmc?.depositService;
    if (!depositService) throw new Error('PMC deposit service configuration not found');

    const { projectId, topic, secretKeyfile } = depositService;
    if (!projectId || !topic || !secretKeyfile) {
      throw new Error('PMC deposit service Pub/Sub configuration incomplete');
    }
    rollingLog.push({ message: 'Pub/Sub config', data: { projectId, topic } });

    const pubSubClient = new PubSub({
      projectId: projectId,
      credentials: JSON.parse(secretKeyfile),
    });

    // Get the submission version to access its current transition and add the job id
    const prisma = await getPrismaClient();
    const submissionVersion = await prisma.submissionVersion.update({
      where: { id: submission_version_id },
      data: {
        job: {
          connect: {
            id: job.id,
          },
        },
      },
      include: {
        submission: {
          include: {
            site: true,
          },
        },
      },
    });
    rollingLog.push({ message: 'submissionVersion', data: submissionVersion });

    if (!submissionVersion) {
      throw new Error(`Submission version ${submission_version_id} not found`);
    }

    if (!submissionVersion.transition) {
      throw new Error(`No transition found for submission version ${submission_version_id}`);
    }

    // Get the target state from the current transition
    const transition = submissionVersion.transition as WorkflowTransition;
    const targetState = transition.targetStateName;
    rollingLog.push({ message: 'targetState', data: targetState });

    const handshake = createHandshakeToken(
      job.id,
      PMC_DEPOSIT_FTP,
      ctx.$config.api.handshakeIssuer,
      ctx.$config.api.handshakeSigningSecret,
    );

    attributes = {
      userId: user_id,
      successState: targetState,
      failureState: PMC_STATE_NAMES.DEPOSIT_FAILED,
      statusUrl: ctx.asApiUrl(
        `/sites/${submissionVersion.submission.site.name}/submissions/${submissionVersion.submission.id}/status`,
      ),
      jobUrl: ctx.asApiUrl(`/jobs/${job.id}`),
      handshake,
    };

    // Publish message to Pub/Sub topic
    const messageId = await pubSubClient.topic(topic).publishMessage({
      data: Buffer.from(JSON.stringify(manifest), 'utf-8'),
      attributes,
    });

    rollingLog.push({ message: 'Message published to Pub/Sub', data: { messageId } });

    // Update job status to indicate Pub/Sub message was sent successfully
    // The final completion will be handled by the Cloud Run function via API callbacks
    await jobs.dbUpdateJob(job.id, {
      status: JobStatus.RUNNING,
      message: 'PMC Deposit message published to Pub/Sub',
      results: {
        ...coerceToObject(job.results),
        manifest,
        attributes,
        pubsubMessageId: messageId,
      },
    });
    rollingLog.push({ message: 'Job updated with Pub/Sub message ID', data: { messageId } });

    return { ok: true };
  } catch (err: any) {
    let errorMessage = 'PMC Deposit fetch or handling error';
    let errorStatus = 500;

    if (err instanceof ErrorWithObject) {
      errorMessage = err.message;
      if (err.data?.status) {
        errorStatus = err.data.status;
      }
    }

    console.error('PMC Deposit error:', errorMessage, err);
    console.log('Rolling log', rollingLog);

    await jobs.dbUpdateJob(job.id, {
      status: JobStatus.FAILED,
      message: errorMessage,
      results: {
        ...coerceToObject(job.results),
        manifest,
        attributes,
        error: err.message,
        errorData: err instanceof ErrorWithObject ? err.data : undefined,
      },
    });

    await $updateSubmissionVersion(user_id, submission_version_id, {
      status: PMC_STATE_NAMES.DEPOSIT_FAILED,
      transition: undefined, // clear the transition
      jobId: job.id, // record the job.id for posterity (later this should be stashed on the activity)
    });

    await ctx.sendSlackNotification({
      eventType: SlackEventType.SUBMISSION_STATUS_CHANGED,
      message: `Submission status changed to ${PMC_STATE_NAMES.DEPOSIT_FAILED}`,
      user: { id: user_id },
      metadata: {
        status: PMC_STATE_NAMES.DEPOSIT_FAILED,
        site: PMC_WORKSPACE_SITE_NAME,
        submissionId: submissionId,
        submissionVersionId: submission_version_id,
        submissionUrl: asSiteSubmissionUrl(ctx.asBaseUrl, PMC_WORKSPACE_SITE_NAME, submissionId),
      },
    });

    throw httpError(errorStatus, errorMessage);
  }
}

export const PMC_DEPOSIT_FTP = 'PMC_DEPOSIT_FTP';
