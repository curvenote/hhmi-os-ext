import { z } from 'zod';
import type { WorkVersionMetadata } from '@curvenote/scms-server';
import type { FileMetadataSection } from '@curvenote/scms-core';
import { pmcFileMappingEntrySchema } from './fileMappings.js';
// hasValidGrantId moved to manual validation in validate.ts

// Enums used in the metadata

export const HHMI = 'hhmi';
export const NIH = 'nih';

export const funderType = z.enum([
  'nih',
  'acl',
  'ahrq',
  'cdc',
  'fda',
  'aspr',
  'epa',
  'nist',
  'dhs',
  'va',
  'hhmi',
]);

export type FunderKey = z.infer<typeof funderType>;

// Grant Entry Schema - new grant-centric model
export const grantEntrySchema = z.object({
  id: z.string().optional(),
  funderKey: funderType,
  grantId: z.string().min(1, 'Grant ID is required'),
  investigatorName: z.string().optional(), // For HHMI grants, store the investigator name
  uniqueId: z.string().optional(), // investigator_name_grant_id — unique when grantIds collide
});

export type GrantEntry = z.infer<typeof grantEntrySchema>;

// Form-specific schemas

export const funderSchema = z.object({
  funder: funderType,
});

// Author schema
const doiAuthorSchema = z.object({
  given: z.string().max(255).optional(),
  family: z.string().max(255).optional(),
  sequence: z.string().max(255).optional(),
  affiliation: z.array(z.string().max(255)).optional(),
});

// Email processing message schema (unified for all message types)
const emailProcessingMessageSchema = z.object({
  type: z.string().refine((val) => val === 'info' || val === 'warning' || val === 'error', {
    message: 'Type must be info, warning, or error',
  }), // Message type
  message: z.string(),
  timestamp: z.string(), // ISO timestamp
  fromStatus: z.string(), // Status we're transitioning from
  toStatus: z.string(), // Status we're transitioning to
  messageId: z.string(), // Reference to the email message
  processor: z.string(), // Which processor created this message
});

// Email processing record schema (per email type)
const emailProcessingRecordSchema = z.object({
  messageId: z.string(), // Reference to Message.id - links to the raw message record
  lastProcessedAt: z.string(), // ISO timestamp - when this was last updated
  manuscriptId: z.string().optional(), // NIHMS manuscript ID - the key mapping we need
  packageId: z.string(), // Our package ID (work version ID) - for verification
  status: z.string().refine((val) => val === 'ok' || val === 'warning' || val === 'error', {
    message: 'Status must be ok, warning, or error',
  }), // Processing outcome
  messages: z.array(emailProcessingMessageSchema), // Unified messages array
});

// Legacy email processing schema (for backward compatibility)
// Legacy emailProcessingSchema removed - use emailProcessingByType instead

/**
 * Schema for required PMC metadata fields
 */
export const requiredPMCMetadataSchema = z.object({
  certifyManuscript: z.boolean().refine((val) => val === true, {
    message:
      'You must certify that your manuscript includes all referenced figures, tables, videos, and supplementary material',
  }),
  title: z
    .string()
    .max(255, { message: 'Article title must be at most 255 characters' })
    .nonempty({ message: 'Article title is required' }),
  journalName: z
    .string()
    .max(255, { message: 'Journal name must be at most 255 characters' })
    .nonempty({ message: 'Journal name is required' }),
  grants: z.array(grantEntrySchema).min(1, 'At least one grant is required'),
  ownerFirstName: z
    .string()
    .max(255, { message: 'Owner first name must be at most 255 characters' })
    .nonempty({ message: 'Owner first name is required' }),
  ownerLastName: z
    .string()
    .max(255, { message: 'Owner last name must be at most 255 characters' })
    .nonempty({ message: 'Owner last name is required' }),
  ownerEmail: z
    .string()
    .email({ message: 'Please enter a valid email address' })
    .max(255, { message: 'Owner email must be at most 255 characters' })
    .nonempty({ message: 'Owner email is required' }),
  // ISSN fields (required for PMC deposits)
  issn: z
    .string()
    .max(255, { message: 'ISSN must be at most 255 characters' })
    .nonempty({ message: 'ISSN is required' }),
  issnType: z.enum(['print', 'electronic'], {
    error: () => 'ISSN type is required',
  }),
});

const reviewerSchema = {
  reviewerFirstName: z.string().max(255),
  reviewerLastName: z.string().max(255),
  reviewerEmail: z.string().email().max(255),
  designateReviewer: z.boolean(),
};

/**
 * The main PMC metadata schema, extending the required fields and making all fields optional
 * Note: emailProcessing has been moved to SubmissionVersion metadata
 */
export const pmcMetadataSchema = requiredPMCMetadataSchema
  .extend({
    ...reviewerSchema,
    // Confirmation
    confirmed: z.boolean().optional(),
    previewed: z.boolean().optional(),

    // DOI Information
    doiSuccess: z.boolean().optional(),
    doiPublishedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .max(255)
      .optional(),
    doiContainerTitle: z.string().max(255).optional(),
    doiShortContainerTitle: z.string().max(255).optional(),
    doiAuthors: z.array(doiAuthorSchema).optional(),
    doiType: z.string().max(255).optional(),
    doiVolume: z.string().max(255).optional(),
    doiIssue: z.string().max(255).optional(),
    doiUrl: z.url().max(255).optional(),
    doiPage: z.string().max(255).optional(),
    doiSource: z.string().max(255).optional(),
    doiPublisher: z.string().max(255).optional(),

    // ISSN fields (optional in main schema for backward compatibility)
    issn: z.string().max(255).optional(),
    issnType: z.enum(['print', 'electronic']).optional(),

    // Backward compatibility: keep funders field optional during transition
    funders: z.array(funderType).optional(),

    /** Maps PMC slots to existing work-version file entries (e.g. article manuscript → pmc/manuscript). */
    fileMappings: z
      .object({
        'pmc/manuscript': z.array(pmcFileMappingEntrySchema).optional(),
      })
      .optional(),
    /** Article manuscript source paths the user explicitly removed from the PMC deposit (one-way until re-upload). */
    excludedManuscriptSourcePaths: z.array(z.string()).optional(),
  })
  .partial();

// Separate validation schema that includes conditional logic
export const validatePMCSchema = requiredPMCMetadataSchema
  .extend({
    reviewerFirstName: reviewerSchema.reviewerFirstName.optional(),
    reviewerLastName: reviewerSchema.reviewerLastName.optional(),
    reviewerEmail: reviewerSchema.reviewerEmail.optional(),
    designateReviewer: reviewerSchema.designateReviewer.optional(),
  })
  .refine((data) => (data.designateReviewer === true ? data.reviewerFirstName : true), {
    message: 'Reviewer first name is required when designating another reviewer',
    path: ['reviewerFirstName'],
  })
  .refine((data) => (data.designateReviewer === true ? data.reviewerLastName : true), {
    message: 'Reviewer last name is required when designating another reviewer',
    path: ['reviewerLastName'],
  })
  .refine((data) => (data.designateReviewer === true ? data.reviewerEmail : true), {
    message: 'Reviewer email is required when designating another reviewer',
    path: ['reviewerEmail'],
  });

// HHMI validation is now handled manually in validatePMCMetadata function

// Migration validation schema that supports both funders and grants during transition
export const validatePMCMigrationSchema = pmcMetadataSchema
  .refine(
    (data) => {
      // At least one of grants or funders must be present
      return (data.grants && data.grants.length > 0) || (data.funders && data.funders.length > 0);
    },
    {
      message: 'At least one grant or funder is required',
      path: ['grants'],
    },
  )
  .refine((data) => (data.designateReviewer === true ? data.reviewerFirstName : true), {
    message: 'Reviewer first name is required when designating another reviewer',
    path: ['reviewerFirstName'],
  })
  .refine((data) => (data.designateReviewer === true ? data.reviewerLastName : true), {
    message: 'Reviewer last name is required when designating another reviewer',
    path: ['reviewerLastName'],
  })
  .refine((data) => (data.designateReviewer === true ? data.reviewerEmail : true), {
    message: 'Reviewer email is required when designating another reviewer',
    path: ['reviewerEmail'],
  });

/**
 * PMC metadata schema for SubmissionVersion
 * Contains email processing information that is specific to the submission process
 */
export const pmcSubmissionVersionMetadataSchema = z.object({
  // Single email processing object with chronological messages array
  emailProcessing: emailProcessingRecordSchema.optional(),
  pmid: z.string().optional(),
  pmcid: z.string().optional(),
  manuscriptId: z.string().optional(), // NIHMS manuscript ID at top level for easy access
});

// Export TypeScript types derived from schemas
export type DoiAuthor = z.infer<typeof doiAuthorSchema>;
export type EmailProcessingMessage = z.infer<typeof emailProcessingMessageSchema>;
export type EmailProcessing = z.infer<typeof emailProcessingRecordSchema>;
export type RequiredPMCMetadata = z.infer<typeof requiredPMCMetadataSchema>;
export type PMCWorkVersionMetadata = z.infer<typeof pmcMetadataSchema>;
export type PMCSubmissionVersionMetadata = z.infer<typeof pmcSubmissionVersionMetadataSchema>;

// Type for the overall metadata structure
export type PMCWorkVersionMetadataSection = {
  pmc?: PMCWorkVersionMetadata;
};

// Type for SubmissionVersion PMC metadata section
export type PMCSubmissionVersionMetadataSection = {
  pmc?: PMCSubmissionVersionMetadata;
};

export type WorkVersionMetadataWithFilesAndPMC = WorkVersionMetadata &
  FileMetadataSection & {
    pmc?: PMCWorkVersionMetadata;
  };

export type SubmissionVersionMetadataWithPMC = {
  pmc?: PMCSubmissionVersionMetadata;
};

// Combined metadata type that merges work version and submission version metadata
export type PMCCombinedMetadataSection = WorkVersionMetadata &
  FileMetadataSection & {
    pmc?: PMCWorkVersionMetadata & PMCSubmissionVersionMetadata;
  };
