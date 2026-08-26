/**
 * Client-safe exports for the Image Integrity Checks extension.
 */

import type {
  ClientExtension,
  ClientExtensionCheckService,
  ExtensionAnalyticsEvents,
  ExtensionIcon,
  NavigationRegistration,
} from '@curvenote/scms-core';
import { imageIntegrityAnalyticsCatalog } from './analytics.catalog.js';
import { Icon, LogoMono, Logo, LogoThemed } from './icons.js';
import { ImageIntegrityChecksSection } from './components/ImageIntegrityChecksSection.js';
import { ProofigUploadCheckOption } from './components/ProofigUploadCheckOption.js';
import { isProofigUploadEligible, resolveProofigUploadEligibility } from './uploadEligibility.js';
import { ImageIntegritySectionHeader } from './components/ImageIntegritySectionHeader.js';
import { ProofigCheckRunTimelineMount } from './components/ProofigCheckRunTimelineMount.js';
import { ProofigSummaryBadge } from './components/ProofigSummaryBadge.js';
import { ProofigSummaryTitle } from './components/ProofigSummaryTitle.js';
import { ProofigWorkListSummary } from './components/ProofigWorkListSummary.js';
import ExtensionAdminCard from './admin/ExtensionAdminCard.js';
import { ExtensionDesigns } from './designs/ExtensionDesigns.js';
import { extensionPackageTitle } from './meta.js';
import { hasError, type ProofigDataSchema } from './schema.js';

export const id = 'checks-proofig';
export const name = extensionPackageTitle;
export const description = 'Image integrity checking service for works';

/** App-absolute POST target for Proofig check mutations (must match `registerRoutes` mount). */
export const PROOFIG_CHECKS_ACTION_PATH = '/app/extensions/proofig/actions' as const;

export const Logos = {
  Icon,
  LogoMono,
  Logo,
  LogoThemed,
};

export function getIcons(): ExtensionIcon[] {
  return [
    {
      id: 'checks-proofig',
      component: Icon,
      tags: ['default', 'light'],
    },
    {
      id: 'proofig-logo-mono',
      component: LogoMono,
      tags: ['text', 'dark'],
    },
    {
      id: 'proofig-logo',
      component: Logo,
      tags: ['text', 'light'],
    },
  ];
}

export function getChecks(): ClientExtensionCheckService[] {
  const checks = [
    {
      id: 'proofig',
      name: 'Image Integrity',
      description: 'Detect potential issues with images in your work.',
      checksActionPath: PROOFIG_CHECKS_ACTION_PATH,
      sectionHeaderComponent: ImageIntegritySectionHeader,
      sectionActivityComponent: ImageIntegrityChecksSection,
      sectionSummaryBadgeComponent: ProofigSummaryBadge,
      sectionSummaryTitleComponent: ProofigSummaryTitle,
      workListSummaryComponent: ProofigWorkListSummary,
      isWorkListSummaryVisible: (metadata: unknown) =>
        !hasError(metadata as ProofigDataSchema | undefined),
      checkRunTimelineMountComponent: ProofigCheckRunTimelineMount,
      uploadCheckOptionComponent: ProofigUploadCheckOption,
      resolveUploadEligibility: resolveProofigUploadEligibility,
      isUploadEligible: isProofigUploadEligible,
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
  return imageIntegrityAnalyticsCatalog;
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
