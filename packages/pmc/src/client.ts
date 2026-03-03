/**
 * Client-safe exports for the PMC Submission extension.
 */

import type {
  ClientExtension,
  ExtensionAnalyticsEvents,
  ExtensionEmailTemplate,
  ExtensionIcon,
  ExtensionTask,
  WorkflowRegistration,
} from '@curvenote/scms-core';
import { registerNavigation } from './navigation.js';
import {
  PMC_PENDING_DEPOSIT_NOTIFICATION,
  PendingDepositNotificationEmail,
} from './backend/emails/pending-deposit-notification.js';
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
        description:
          'Email sent to support when a new PMC deposit is confirmed and marked PENDING',
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
  ];
}

export const extension: ClientExtension = {
  id,
  name,
  description,
  getTasks,
  getIcons,
  getAnalyticsEvents,
  getEmailTemplates,
  getWorkflows,
  registerNavigation,
};
