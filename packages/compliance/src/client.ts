/**
 * Client-safe exports for the HHMI Compliance extension.
 */

import type {
  ClientExtension,
  ExtensionAnalyticsEvents,
  ExtensionEmailTemplate,
  ExtensionIcon,
  ExtensionTask,
} from '@curvenote/scms-core';
import { HHMIComplianceIcon } from './icons.js';
import { ComplianceReportTaskCard } from './ComplianceReportTaskCard.js';
import { HHMITrackEvent, HHMITrackEventDescriptions } from './analytics/events.js';
import { ComplianceReportSharedEmail } from './backend/emails/compliance-report-shared.js';
import { ComplianceReportRequestEmailTemplate } from './backend/emails/compliance-report-request-email.js';
import { GeneralHelpRequestEmailTemplate } from './backend/emails/general-help-request-email.js';
import { PublicationHelpRequestEmailTemplate } from './backend/emails/publication-help-request-email.js';
import { WorkspaceInvitationEmailTemplate } from './backend/emails/workspace-invitation-email.js';
import { registerNavigation } from './navigation.js';
import { ComplianceWizardTaskCard } from './ComplianceWizardTaskCard.js';

export const id = 'hhmi-compliance';
export const name = 'HHMI Compliance';
export const description = 'Open Science Compliance Management';

/**
 * Returns the list of compliance-related tasks for the extension.
 * @returns Array of extension tasks including compliance dashboard and wizard.
 */
export function getTasks(): ExtensionTask[] {
  return [
    {
      id: 'hhmi-compliance-report',
      name: 'View Your Compliance Dashboard',
      description:
        'Get an up to date review of the compliance of your preprints and journal articles.',
      component: ComplianceReportTaskCard,
    },
    {
      id: 'compliance-wizard',
      name: 'Get Help with Open Access Policy Compliance',
      description: 'Answer questions to understand your compliance requirements',
      component: ComplianceWizardTaskCard,
    },
  ];
}

/**
 * Returns the list of icons for the compliance extension.
 * @returns Array of extension icons.
 */
export function getIcons(): ExtensionIcon[] {
  return [
    {
      id: 'hhmi-compliance',
      component: HHMIComplianceIcon,
      tags: ['default', 'light'],
    },
  ];
}

/**
 * Returns analytics events configuration for the compliance extension.
 * @returns Object containing event mappings and descriptions.
 */
export function getAnalyticsEvents(): ExtensionAnalyticsEvents {
  return {
    events: Object.fromEntries(Object.entries(HHMITrackEvent).map(([key, value]) => [key, value])),
    descriptions: HHMITrackEventDescriptions,
  };
}

/**
 * Returns email templates for compliance-related notifications.
 * @returns Array of email template configurations.
 */
export function getEmailTemplates(): ExtensionEmailTemplate[] {
  return [
    {
      eventType: 'COMPLIANCE_REPORT_INVITATION',
      component: ComplianceReportSharedEmail,
      props: {},
      templateInfo: {
        name: 'Compliance Dashboard Invitation',
        description: 'Email sent when a user is granted access to view a compliance dashboard',
        exampleSubject: "You've been granted access to view Dr. Smith's compliance dashboard",
        fields: [
          {
            name: 'scientistName',
            label: 'Scientist Name',
            type: 'text',
            example: 'Dr. Jane Smith',
          },
          {
            name: 'reportUrl',
            label: 'Report URL',
            type: 'url',
            example: 'https://app.curvenote.com/app/compliance/reports/0000-0000-0000-0000',
          },
          {
            name: 'inviterName',
            label: 'Inviter Name',
            type: 'text',
            example: 'Dr. John Doe',
          },
          {
            name: 'inviterEmail',
            label: 'Inviter Email',
            type: 'email',
            example: 'john.doe@example.com',
          },
          {
            name: 'recipientName',
            label: 'Recipient Name',
            type: 'text',
            example: 'Dr. Alice Johnson',
          },
        ],
      },
    },
    {
      eventType: 'COMPLIANCE_REPORT_REQUEST',
      component: ComplianceReportRequestEmailTemplate,
      props: {},
      templateInfo: {
        name: 'Compliance Dashboard Request',
        description:
          'Email sent when a user has linked their ORCID but is not yet included in the HHMI compliance database',
        exampleSubject: 'Compliance Dashboard Requested',
        fields: [
          {
            name: 'userName',
            label: 'User Name',
            type: 'text',
            example: 'Dr. Jane Smith',
          },
          {
            name: 'userEmail',
            label: 'User Email',
            type: 'email',
            example: 'jane.smith@example.com',
          },
          {
            name: 'orcid',
            label: 'ORCID',
            type: 'text',
            example: '0000-0000-0000-0000',
          },
          {
            name: 'sanitizedMessage',
            label: 'Additional Message',
            type: 'textarea',
            optional: true,
            example: 'I would like to request access to my compliance dashboard.',
          },
        ],
      },
    },
    {
      eventType: 'COMPLIANCE_GENERAL_HELP_REQUEST',
      component: GeneralHelpRequestEmailTemplate,
      props: {},
      templateInfo: {
        name: 'Compliance General Help Request',
        description: 'Email sent when a user requests general help regarding compliance',
        exampleSubject: 'Help Requested on Compliance',
        fields: [
          {
            name: 'userName',
            label: 'User Name',
            type: 'text',
            example: 'Dr. Jane Smith',
          },
          {
            name: 'userEmail',
            label: 'User Email',
            type: 'email',
            example: 'jane.smith@example.com',
          },
          {
            name: 'orcid',
            label: 'ORCID',
            type: 'text',
            optional: true,
            example: '0000-0000-0000-0000',
          },
          {
            name: 'sanitizedMessage',
            label: 'Message',
            type: 'textarea',
            optional: true,
            example: 'I need help understanding my compliance status.',
          },
        ],
      },
    },
    {
      eventType: 'COMPLIANCE_PUBLICATION_HELP_REQUEST',
      component: PublicationHelpRequestEmailTemplate,
      props: {},
      templateInfo: {
        name: 'Compliance Publication Help Request',
        description:
          'Email sent when a user requests help regarding a specific publication in the compliance dashboard',
        exampleSubject: 'Help Requested on Compliance for a Publication',
        fields: [
          {
            name: 'userName',
            label: 'User Name',
            type: 'text',
            example: 'Dr. Jane Smith',
          },
          {
            name: 'userEmail',
            label: 'User Email',
            type: 'email',
            example: 'jane.smith@example.com',
          },
          {
            name: 'orcid',
            label: 'ORCID',
            type: 'text',
            example: '0000-0000-0000-0000',
          },
          {
            name: 'message',
            label: 'Message',
            type: 'textarea',
            example: 'I have a question about this publication.',
          },
          {
            name: 'publication',
            label: 'Publication',
            type: 'textarea',
            optional: true,
            example: 'JSON object with publication details',
          },
        ],
      },
    },
    {
      eventType: 'WORKSPACE_INVITATION',
      component: WorkspaceInvitationEmailTemplate,
      props: {},
      templateInfo: {
        name: 'Workspace Invitation',
        description: 'Email sent when a user is invited to join the workspace',
        exampleSubject: "You've been invited to join the HHMI Workspace",
        fields: [
          {
            name: 'recipientEmail',
            label: 'Recipient Email',
            type: 'email',
            example: 'colleague@example.com',
          },
          {
            name: 'inviterName',
            label: 'Inviter Name',
            type: 'text',
            optional: true,
            example: 'Dr. Jane Smith',
          },
          {
            name: 'inviterEmail',
            label: 'Inviter Email',
            type: 'email',
            optional: true,
            example: 'jane.smith@example.com',
          },
          {
            name: 'platformName',
            label: 'Platform Name',
            type: 'text',
            example: 'HHMI Workspace',
          },
          {
            name: 'signupUrl',
            label: 'Signup URL',
            type: 'url',
            example: 'https://app.curvenote.com/signup',
          },
          {
            name: 'personalMessage',
            label: 'Personal Message',
            type: 'textarea',
            optional: true,
            example: 'Looking forward to collaborating with you on compliance dashboards.',
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
  registerNavigation,
} as const;
