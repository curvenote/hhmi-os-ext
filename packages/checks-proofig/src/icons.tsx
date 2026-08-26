import { FileCheck } from 'lucide-react';
import { cn } from '@curvenote/scms-core';
import proofigLogoMono from './assets/proofig-logo-mono.svg';
import proofigLogo from './assets/proofig-logo.svg';

export function Icon({ className }: { className?: string }) {
  return <FileCheck className={className} />;
}

export function LogoMono({ className }: { className?: string }) {
  return <img src={proofigLogoMono} alt="Proofig Logo Mono" className={className} />;
}

export function Logo({ className }: { className?: string }) {
  return <img src={proofigLogo} alt="Proofig Logo" className={className} />;
}

export function LogoThemed({
  className,
  alt = 'Proofig',
}: {
  className?: string;
  /** Accessibility label for both light and dark logo variants. */
  alt?: string;
}) {
  return (
    <span className={cn('inline-flex shrink-0 items-center', className)}>
      <img src={proofigLogo} alt={alt} className="h-full w-auto dark:hidden" />
      <img src={proofigLogoMono} alt={alt} className="hidden h-full w-auto dark:block" />
    </span>
  );
}
