/**
 * Client-safe exports for the Text Integrity Checks extension.
 */

import type {
  ClientExtension,
  ClientExtensionCheckService,
  ExtensionAnalyticsEvents,
  ExtensionIcon,
  NavigationRegistration,
} from '@curvenote/scms-core';
import { textIntegrityAnalyticsCatalog } from './analytics.catalog.js';
import { TextIntegrityIcon, TextIntegrityLogo, TextIntegrityLogoMono } from './icons.js';
import { TextIntegrityChecksSection } from './components/TextIntegrityChecksSection.js';
import { TextIntegrityUploadCheckOption } from './components/TextIntegrityUploadCheckOption.js';
import { isTextIntegrityUploadEligible } from './uploadEligibility.js';
import { TextIntegritySectionHeader } from './components/TextIntegritySectionHeader.js';
import { TextIntegritySummaryBadge } from './components/TextIntegritySummaryBadge.js';
import { TextIntegritySummaryTitle } from './components/TextIntegritySummaryTitle.js';
import { TextIntegrityWorkListSummary } from './components/TextIntegrityWorkListSummary.js';
import { hasError, type TextIntegrityDataSchema } from './schema.js';
import ExtensionAdminCard from './admin/ExtensionAdminCard.js';
import { ExtensionDesigns } from './designs/ExtensionDesigns.js';
import { extensionPackageTitle } from './meta.js';

export const id = 'checks-text-integrity';
export const name = extensionPackageTitle;
export const description = 'Text integrity checking service for works';

/** App-absolute POST target for Text Integrity check mutations (must match `registerRoutes` mount). */
export const TEXT_INTEGRITY_CHECKS_ACTION_PATH =
  '/app/extensions/checks-text-integrity/actions' as const;

export const Logos = {
  TextIntegrityIcon,
  TextIntegrityLogo,
  TextIntegrityLogoMono,
};

export function getIcons(): ExtensionIcon[] {
  return [
    {
      id: 'checks-text-integrity',
      component: TextIntegrityIcon,
      tags: ['default', 'light'],
    },
    {
      id: 'checks-text-integrity-logo',
      component: TextIntegrityLogo,
      tags: ['text', 'light'],
    },
    {
      id: 'checks-text-integrity-logo-mono',
      component: TextIntegrityLogoMono,
      tags: ['text', 'dark'],
    },
  ];
}

export function getChecks(): ClientExtensionCheckService[] {
  const checks = [
    {
      id: 'checks-text-integrity',
      name: 'Text Integrity',
      description: 'Verify text integrity in your work.',
      checksActionPath: TEXT_INTEGRITY_CHECKS_ACTION_PATH,
      sectionHeaderComponent: TextIntegritySectionHeader,
      sectionActivityComponent: TextIntegrityChecksSection,
      sectionSummaryBadgeComponent: TextIntegritySummaryBadge,
      sectionSummaryTitleComponent: TextIntegritySummaryTitle,
      workListSummaryComponent: TextIntegrityWorkListSummary,
      isWorkListSummaryVisible: (metadata: unknown) =>
        !hasError(metadata as TextIntegrityDataSchema | undefined),
      uploadCheckOptionComponent: TextIntegrityUploadCheckOption,
      isUploadEligible: isTextIntegrityUploadEligible,
    },
  ];
  return checks;
}

export function registerNavigation(): NavigationRegistration[] {
  return [];
}

export function getExtensionAdminCard() {
  return ExtensionAdminCard;
}

export function getDesigns() {
  return ExtensionDesigns;
}

export function getAnalyticsEvents(): ExtensionAnalyticsEvents {
  return textIntegrityAnalyticsCatalog;
}

export const extension: ClientExtension = {
  id,
  name,
  description,
  getIcons,
  getChecks,
  registerNavigation,
  getExtensionAdminCard,
  getDesigns,
  getAnalyticsEvents,
} as const;
