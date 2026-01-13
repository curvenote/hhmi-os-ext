/**
 * Client-safe exports for the PMC Submission extension.
 */

import type {
  ClientExtension,
  ExtensionAnalyticsEvents,
  ExtensionIcon,
  ExtensionTask,
  WorkflowRegistration,
} from '@curvenote/scms-core';
import { registerNavigation } from './navigation.js';
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

export const extension: ClientExtension = {
  id,
  name,
  description,
  getTasks,
  getIcons,
  getAnalyticsEvents,
  getWorkflows,
  registerNavigation,
};
