'use client';

import { useEffect, useRef } from 'react';
import { ui, useRevalidateOnInterval, ServiceLogo } from '@curvenote/scms-core';
import { TextIntegrityTrackEvent } from '../analytics.catalog.js';
import { useChecksPingEvent } from '@hhmi/checks-shared/analytics/client';
import { TextIntegrityRunChecksButton } from './TextIntegrityRunChecksButton.js';
import { TextIntegrityCheckRunRetryButton } from './TextIntegrityCheckRunRetryButton.js';
import { CTAPlaceholderPanel } from './CTAPlaceholderPanel.js';
import { TextIntegrityProgressComponent } from './TextIntegrityProgressComponent.js';
import { TextIntegrityResultsArea } from './TextIntegrityResultsArea.js';
import type { TextIntegrityDataSchema } from '../schema.js';
import {
  canShowResults,
  getTextIntegrityManifest,
  isAwaitingInitialTextIntegrityStages,
  shouldPollTextIntegrityChecks,
  getRetrySupersessionInfo,
} from '../schema.js';
import { RetriedRunNotice } from './RetriedRunNotice.js';
import { textIntegrityServiceLogoClassName } from '../textIntegrityLogoStyles.js';

interface TextIntegrityChecksSectionProps {
  metadata: TextIntegrityDataSchema | undefined;
  remoteStatusActionPath?: string;
  workVersionId?: string;
  checkRunId?: string;
  /** ISO `CheckServiceRun.date_modified` — used to decide when refresh / stale UI is shown. */
  checkRunDateModified?: string;
}

export function TextIntegrityChecksSection({
  metadata,
  remoteStatusActionPath,
  workVersionId,
  checkRunId,
  checkRunDateModified,
}: TextIntegrityChecksSectionProps) {
  const pingEvent = useChecksPingEvent({
    checkKind: 'checks-text-integrity',
    workVersionId,
  });
  const lastTrackedCheckRunIdRef = useRef<string | undefined>(undefined);
  const hasData = !!metadata?.stages;
  const showResults = canShowResults(metadata);
  const awaitingInitialStages = isAwaitingInitialTextIntegrityStages(metadata, checkRunId);
  const manifest = getTextIntegrityManifest(metadata);
  const manifestLogo = manifest?.logo;
  const manifestTitle = manifest?.title;

  useRevalidateOnInterval({
    enabled: shouldPollTextIntegrityChecks(metadata, checkRunId),
    interval: awaitingInitialStages ? 2000 : 3000,
  });

  useEffect(() => {
    if (
      !showResults ||
      !metadata?.summaryReport ||
      !workVersionId ||
      !checkRunId ||
      lastTrackedCheckRunIdRef.current === checkRunId
    ) {
      return;
    }
    lastTrackedCheckRunIdRef.current = checkRunId;
    void pingEvent(TextIntegrityTrackEvent.CHECKS_RESULTS_DISPLAYED, {
      checkRunId,
      similarityScore: metadata.summaryReport.overallMatchPercentage,
    });
  }, [checkRunId, metadata?.summaryReport, pingEvent, showResults, workVersionId]);

  if (!hasData) {
    return (
      <CTAPlaceholderPanel
        logo={
          <ServiceLogo
            logoUrl={manifestLogo}
            alt={manifestTitle}
            fallback={manifestTitle}
            className={textIntegrityServiceLogoClassName('mb-4 h-8')}
          />
        }
        title="No text integrity checks run yet"
        description="Run text integrity checks to verify text in your work."
        action={
          workVersionId ? (
            <TextIntegrityRunChecksButton
              actionPath={remoteStatusActionPath}
              workVersionId={workVersionId}
            />
          ) : null
        }
      />
    );
  }

  if (showResults && !metadata.summaryReport) {
    const supersession = getRetrySupersessionInfo(metadata);
    return (
      <div className="flex flex-col gap-4">
        <ui.SimpleAlert
          type="error"
          message="Processing completed but no summary report was received. Please contact support."
        />
        {supersession ? (
          <RetriedRunNotice supersession={supersession} />
        ) : workVersionId ? (
          <TextIntegrityCheckRunRetryButton
            actionPath={remoteStatusActionPath}
            workVersionId={workVersionId}
            checkRunId={checkRunId}
          />
        ) : null}
      </div>
    );
  }

  if (showResults && metadata.summaryReport) {
    return (
      <TextIntegrityResultsArea
        metadata={metadata}
        actionPath={remoteStatusActionPath}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
      />
    );
  }

  return (
    <div>
      <TextIntegrityProgressComponent
        metadata={metadata}
        actionPath={remoteStatusActionPath}
        workVersionId={workVersionId}
        checkRunId={checkRunId}
        checkRunDateModified={checkRunDateModified}
      />
    </div>
  );
}
