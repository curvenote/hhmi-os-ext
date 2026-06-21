import type {
  ClientExtension,
  ExtensionAnalyticsEvents,
  ExtensionIcon,
  ExtensionTask,
} from '@curvenote/scms-core';
import { BioRxivTaskCard } from './BioRxivTaskCard.js';
import { BioRxivIcon } from './Icon.js';
import { BioRxivTrackEvent, BioRxivTrackEventDescriptions } from './analytics/events.js';
import { registerNavigation } from './navigation.js';

export const id = 'biorxiv';
export const name = 'bioRxiv';
export const description = 'Submit preprints to bioRxiv';

export function getTasks(): ExtensionTask[] {
  return [
    {
      id: 'biorxiv-submit',
      name: 'Submit to bioRxiv',
      description: 'Submit a preprint to bioRxiv',
      component: BioRxivTaskCard,
      category: 'publish',
    },
  ];
}

export function getIcons(): ExtensionIcon[] {
  return [
    {
      id: 'biorxiv',
      component: BioRxivIcon,
      tags: ['default', 'light'],
    },
  ];
}

export function getAnalyticsEvents(): ExtensionAnalyticsEvents {
  return {
    events: BioRxivTrackEvent,
    descriptions: BioRxivTrackEventDescriptions,
  };
}

export const extension: ClientExtension = {
  id,
  name,
  description,
  getTasks,
  getIcons,
  getAnalyticsEvents,
  registerNavigation,
};
