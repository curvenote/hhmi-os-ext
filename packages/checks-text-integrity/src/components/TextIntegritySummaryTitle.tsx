import type { ExtensionCheckSectionSummaryTitleProps } from '@curvenote/scms-core';
import { cn, ServiceLogo } from '@curvenote/scms-core';
import { extensionPackageTitle } from '../meta.js';
import { getTextIntegrityManifest } from '../schema.js';
import { textIntegrityServiceLogoClassName } from '../textIntegrityLogoStyles.js';

type TextIntegritySummaryTitleProps = ExtensionCheckSectionSummaryTitleProps & {
  className?: string;
};

export function TextIntegritySummaryTitle({ metadata, className }: TextIntegritySummaryTitleProps) {
  const manifest = getTextIntegrityManifest(metadata);
  const logoAlt = manifest?.title ?? extensionPackageTitle;

  return (
    <ServiceLogo
      logoUrl={manifest?.logo}
      alt={logoAlt}
      fallback={logoAlt}
      className={textIntegrityServiceLogoClassName(cn('h-3 max-w-[9rem]', className))}
    />
  );
}
