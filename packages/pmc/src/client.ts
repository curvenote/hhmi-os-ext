/**
 * Client-safe exports for the PMC Submission extension.
 */

import type {
  ClientExtension,
  ExtensionAnalyticsEvents,
  ExtensionEmailTemplate,
  ExtensionIcon,
  ExtensionTask,
  WorkCreateOption,
  WorkflowRegistration,
} from '@curvenote/scms-core';
import { registerNavigation } from './navigation.js';
import {
  PMC_PENDING_DEPOSIT_NOTIFICATION,
  PendingDepositNotificationEmail,
} from './backend/emails/pending-deposit-notification.js';
import {
  PMC_NIHMS_FILES_REQUESTED,
  NihmsFilesRequestedEmail,
} from './backend/emails/nihms-files-requested.js';
import {
  PMC_REQUEST_NEW_VERSION_BY_TEAM,
  RequestNewVersionByTeamEmail,
} from './backend/emails/request-new-version-by-team.js';
import { PMCDepositTaskCard } from './DepositTaskCard.js';
import { PMCIcon } from './Icon.js';
import { PMCTrackEvent, PMCTrackEventDescriptions } from './analytics/events.js';
import { workflows } from './workflows.js';

export const id = 'pmc';
export const name = 'PMC Submission';
export const description = 'Submit to PubMed Central';

/**
 * Returns the list of PMC-related tasks for the extension.
 * @returns Array of extension tasks
 */
export function getTasks(): ExtensionTask[] {
  return [
    {
      id: 'pmc-deposit',
      name: 'PMC Deposit',
      description: 'Submit to PubMed Central',
      component: PMCDepositTaskCard,
      category: 'publish',
    },
  ];
}

export function getWorkCreateOptions(): WorkCreateOption[] {
  return [
    {
      id: 'pmc-deposit',
      label: 'PMC Deposit',
      description: 'Upload an author accepted manuscript and send to NIHMS',
      icon: PMCIcon,
      metadataKey: 'pmc',
      startPath: '/app/works/pmc',
      formPathIncludes: '/site/pmc/',
      mode: 'standalone',
      order: 10,
    },
  ];
}

/**
 * Returns the list of icons for the PMC extension.
 * @returns Array of extension icons
 */
export function getIcons(): ExtensionIcon[] {
  return [
    {
      id: 'pmc',
      component: PMCIcon,
      tags: ['default', 'light'],
    },
  ];
}

/**
 * Returns analytics events configuration for the PMC extension.
 * @returns Object containing event mappings and descriptions
 */
export function getAnalyticsEvents(): ExtensionAnalyticsEvents {
  return {
    events: PMCTrackEvent,
    descriptions: PMCTrackEventDescriptions,
  };
}

/**
 * Returns workflow registrations for the PMC extension.
 * @returns Workflow registration object
 */
export function getWorkflows(): WorkflowRegistration {
  return { workflows };
}

/**
 * Returns email templates for PMC-related notifications.
 * @returns Array of email template configurations
 */
export function getEmailTemplates(): ExtensionEmailTemplate[] {
  return [
    {
      eventType: PMC_PENDING_DEPOSIT_NOTIFICATION,
      component: PendingDepositNotificationEmail,
      props: {},
      templateInfo: {
        name: 'PMC Pending Deposit Notification',
        description: 'Email sent to support when a new PMC deposit is confirmed and marked PENDING',
        exampleSubject: 'PMC: New deposit marked PENDING',
        fields: [
          { name: 'title', label: 'Title', type: 'text', example: 'Untitled' },
          { name: 'journalName', label: 'Journal', type: 'text', example: '—' },
          { name: 'doiUrl', label: 'DOI', type: 'url', example: '—' },
          { name: 'workVersionId', label: 'Work version ID', type: 'text', example: '' },
          {
            name: 'adminSubmissionUrl',
            label: 'Admin submission URL',
            type: 'url',
            example: 'https://app.example.com/app/works/.../site/pmc/submission/...',
          },
        ],
      },
    },
    {
      eventType: PMC_NIHMS_FILES_REQUESTED,
      component: NihmsFilesRequestedEmail,
      props: {},
      templateInfo: {
        name: 'PMC NIHMS Files Requested',
        description:
          'Email sent to the submitter when NIHMS requests additional files; also used to notify support when the submitter cannot be emailed',
        exampleSubject: 'NIHMS Files Requested for {manuscriptId}',
        fields: [
          {
            name: 'submitterName',
            label: 'Submitter Name',
            type: 'text',
            optional: true,
            example: 'Dr. Jane Smith',
          },
          {
            name: 'manuscriptId',
            label: 'Manuscript ID',
            type: 'text',
            example: 'NIHMS12345',
          },
          {
            name: 'message',
            label: 'NIHMS Message',
            type: 'textarea',
            example: 'Please provide the revised manuscript.',
          },
          {
            name: 'depositUrl',
            label: 'Deposit URL',
            type: 'url',
            example: 'https://app.example.com/app/works/.../site/pmc/deposit/...',
          },
        ],
      },
    },
    {
      eventType: PMC_REQUEST_NEW_VERSION_BY_TEAM,
      component: RequestNewVersionByTeamEmail,
      props: {},
      templateInfo: {
        name: 'PMC Request New Version (by team)',
        description:
          'Email sent to the submitter when the HHMI Open Science team triggers "Request new version" from the admin UI',
        exampleSubject: 'New version requested for your PMC deposit',
        fields: [
          {
            name: 'submitterName',
            label: 'Submitter Name',
            type: 'text',
            optional: true,
            example: 'Dr. Jane Smith',
          },
          {
            name: 'depositUrl',
            label: 'Deposit URL',
            type: 'url',
            example: 'https://app.example.com/app/works/.../site/pmc/deposit/...',
          },
          {
            name: 'supportEmail',
            label: 'Support Email',
            type: 'text',
            example: 'support@example.com',
          },
        ],
      },
    },
  ];
}

export const extension: ClientExtension = {
  id,
  name,
  description,
  getTasks,
  getWorkCreateOptions,
  getIcons,
  getAnalyticsEvents,
  getEmailTemplates,
  getWorkflows,
  registerNavigation,
};
