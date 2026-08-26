import type { ExtensionCheckSectionSummaryTitleProps } from '@curvenote/scms-core';
import { cn } from '@curvenote/scms-core';
import { extensionPackageTitle } from '../meta.js';
import { LogoThemed } from '../icons.js';

type ProofigSummaryTitleProps = ExtensionCheckSectionSummaryTitleProps & {
  className?: string;
};

export function ProofigSummaryTitle({ className }: ProofigSummaryTitleProps) {
  return (
    <LogoThemed
      className={cn('h-5 max-w-[13rem] object-contain object-left', className)}
      alt={extensionPackageTitle}
    />
  );
}
