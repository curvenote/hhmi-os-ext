import { cn } from '@curvenote/scms-core';

/**
 * iThenticate's bundled logo uses dark teal (#003c47) wordmark — low contrast on dark UI.
 * Invert in dark mode (same approach as Proofig's mono swap, without a second asset).
 */
export const TEXT_INTEGRITY_SERVICE_LOGO_DARK_CLASS = 'dark:brightness-0 dark:invert';

export function textIntegrityServiceLogoClassName(className?: string) {
  return cn('object-contain object-left', TEXT_INTEGRITY_SERVICE_LOGO_DARK_CLASS, className);
}
