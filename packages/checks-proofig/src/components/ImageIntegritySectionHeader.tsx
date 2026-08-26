import type React from 'react';
import { Logos } from '../client.js';

export function ImageIntegritySectionHeader({
  tag,
  action,
}: {
  tag: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 items-center w-full">
      <Logos.LogoThemed className="h-8" />
      <div>{tag}</div>
      <div className="grow" />
      {action != null && <div className="flex justify-end">{action}</div>}
    </div>
  );
}
