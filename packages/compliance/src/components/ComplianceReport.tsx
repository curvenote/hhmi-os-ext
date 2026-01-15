import { useState, useEffect } from 'react';
import { BookCheckIcon, User, UserPlus } from 'lucide-react';
import {
  SectionWithHeading,
  ui,
  RequestHelpDialog,
  clearOrcidRequestSent,
  usePingEvent,
} from '@curvenote/scms-core';
import { ScientistCard } from './ScientistCard.js';
import { NonCoveredPublicationsSection } from './NonCoveredPublicationSection.js';
import type { NormalizedScientist, NormalizedArticleRecord } from '../backend/types.js';
import { CoveredArticleItem } from './CoveredArticleItem.js';
import { NotCoveredArticleItem } from './NotCoveredArticleItem.js';
import { CoveredPublicationSection } from './CoveredPublicationSection.js';
import { HHMITrackEvent } from '../analytics/events.js';
import type { ViewContext } from './Badges.js';

/**
 * Props for the ComplianceReport component.
 * This component is used across multiple routes, so the interface defines
 * the shared contract that all route loaders must satisfy.
 */
export interface ComplianceReportProps {
  orcid: string;
  scientist: NormalizedScientist | undefined;
  error?: string;

  // New preprints-based data (used in compliance.reports.me)
  articlesCovered?: Promise<NormalizedArticleRecord[]>;
  articlesNotCovered?: Promise<NormalizedArticleRecord[]>;
  onShareClick?: () => void;
  shareButtonText?: string;
  viewContext: ViewContext;
  emptyMessageCovered?: string;
  emptyMessageNotCovered?: string;
}

export function ComplianceReport({
  scientist,
  articlesCovered,
  articlesNotCovered,
  error,
  orcid,
  onShareClick,
  shareButtonText = 'Give Access to Someone',
  viewContext,
  emptyMessageCovered,
  emptyMessageNotCovered,
}: ComplianceReportProps) {
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const pingEvent = usePingEvent();

  // Clear localStorage flag when scientist data becomes available
  useEffect(() => {
    if (scientist && orcid) {
      clearOrcidRequestSent(orcid);
    }
  }, [scientist, orcid]);

  const handleShareClick = () => {
    pingEvent(
      HHMITrackEvent.HHMI_COMPLIANCE_REPORT_SHARE_CLICKED,
      {
        orcid,
        scientistName: scientist?.fullName,
      },
      { anonymous: true },
    );
    onShareClick?.();
  };

  const handleHelpClick = () => {
    pingEvent(
      HHMITrackEvent.HHMI_COMPLIANCE_HELP_REQUESTED,
      {
        orcid,
        scientistName: scientist?.fullName,
        context: 'compliance-report',
      },
      { anonymous: true },
    );
    setShowHelpDialog(true);
  };

  const handleHelpDialogClose = (open: boolean) => {
    if (!open) {
      pingEvent(
        HHMITrackEvent.HHMI_COMPLIANCE_HELP_MODAL_CLOSED,
        {
          orcid,
          scientistName: scientist?.fullName,
          context: 'compliance-report',
          closeMethod: 'click-outside-or-escape',
        },
        { anonymous: true },
      );
    }
    setShowHelpDialog(open);
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 mb-6 bg-red-50 rounded-lg border border-red-200 dark:bg-red-900/20">
          <div className="text-red-700 dark:text-red-400">
            <h3 className="mb-2 font-semibold">Error</h3>
            <p>{error}</p>
          </div>
        </div>
      )}
      <SectionWithHeading
        heading={
          onShareClick ? (
            <div className="flex justify-between items-center">
              <div>Profile</div>
              <ui.Button
                variant="outline"
                size="sm"
                onClick={handleShareClick}
                title={shareButtonText}
              >
                <UserPlus className="w-4 h-4 stroke-[1.5px]" /> {shareButtonText}
              </ui.Button>
            </div>
          ) : (
            <div>Profile</div>
          )
        }
        icon={User}
      >
        <ScientistCard scientist={scientist} emptyMessage={`No data found for ORCID: ${orcid}`} />
        <div className="flex justify-end items-center w-full row">
          <ui.Button variant="link" className="text-xs" onClick={handleHelpClick}>
            Something not right? Request help.
          </ui.Button>
        </div>
      </SectionWithHeading>
      <RequestHelpDialog
        orcid={orcid}
        open={showHelpDialog}
        onOpenChange={handleHelpDialogClose}
        prompt="Please give us more details about what is missing or incorrect."
        title="Request Help from the Open Science Team"
        successMessage="Your request has been sent to the HHMI Open Science Team. We'll get back to you as soon as possible."
        intent="general-help"
      />
      <SectionWithHeading heading="Publications" icon={BookCheckIcon}>
        <ui.Tabs defaultValue="covered" className="w-full">
          <ui.TabsList>
            <ui.TabsTrigger value="covered">Under HHMI Policy</ui.TabsTrigger>
            <ui.TabsTrigger value="not-covered">Not under HHMI Policy</ui.TabsTrigger>
          </ui.TabsList>
          <ui.TabsContent value="covered">
            <CoveredPublicationSection
              publications={articlesCovered}
              emptyMessage={emptyMessageCovered}
              ItemComponent={CoveredArticleItem}
              orcid={orcid}
              scientist={scientist}
              viewContext={viewContext}
            />
          </ui.TabsContent>
          <ui.TabsContent value="not-covered">
            <NonCoveredPublicationsSection
              publications={articlesNotCovered}
              emptyMessage={emptyMessageNotCovered}
              ItemComponent={NotCoveredArticleItem}
              orcid={orcid}
              scientist={scientist}
              viewContext={viewContext}
            />
          </ui.TabsContent>
        </ui.Tabs>
      </SectionWithHeading>
    </div>
  );
}
