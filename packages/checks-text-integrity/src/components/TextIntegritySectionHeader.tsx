import type React from 'react';
import { ServiceLogo } from '@curvenote/scms-core';
import { getTextIntegrityManifest } from '../schema.js';
import { textIntegrityServiceLogoClassName } from '../textIntegrityLogoStyles.js';

export function TextIntegritySectionHeader({
  tag,
  action,
  metadata,
}: {
  tag: React.ReactNode;
  action?: React.ReactNode;
  /** Latest run's `serviceData` — we read the snapshotted service manifest from it. */
  metadata?: unknown;
}) {
  const manifest = getTextIntegrityManifest(metadata);
  const title = manifest?.title;
  return (
    <div className="flex gap-2 items-center w-full">
      <ServiceLogo
        logoUrl={manifest?.logo}
        alt={title}
        fallback={title ?? 'Text Integrity'}
        className={textIntegrityServiceLogoClassName('h-4')}
      />
      <div>{tag}</div>
      <div className="grow" />
      {action != null && <div className="flex justify-end">{action}</div>}
    </div>
  );
}
