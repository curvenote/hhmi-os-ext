import { AlertTriangle } from 'lucide-react';
import { ui } from '@curvenote/scms-core';

export function MissingReportUrlIcon() {
  return (
    <ui.SimpleTooltip
      title="There has been a problem and the proofing URL is not available. Please contact support."
      delayDuration={250}
    >
      <span className="inline-flex cursor-pointer" role="img" aria-label="Report URL unavailable">
        <AlertTriangle className="w-5 h-5 stroke-red-500" strokeWidth={2} />
      </span>
    </ui.SimpleTooltip>
  );
}
