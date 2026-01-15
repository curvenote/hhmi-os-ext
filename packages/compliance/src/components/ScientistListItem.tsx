import { Link } from 'react-router';
import { Check, Mail, UserPlus } from 'lucide-react';
import { ui, usePingEvent, cn, plural } from '@curvenote/scms-core';
import type { NormalizedScientist } from '../backend/types.js';
import { CheckBadgeIcon } from '@heroicons/react/24/outline';
import { OrcidIcon } from '@scienceicons/react/24/solid';
import { HHMITrackEvent } from '../analytics/events.js';
import { ShareReportDialog } from './ShareReportDialog.js';
import { useState } from 'react';

interface ScientistInfoProps {
  scientist: NormalizedScientist;
  baseUrl: string;
  pingEvent: (event: any, data: any, options?: any) => void;
}

function ScientistInfo({ scientist, baseUrl, pingEvent }: ScientistInfoProps) {
  return (
    <div className="flex flex-col gap-[2px] items-top grow">
      <Link
        to={scientist.orcid ? `${baseUrl}/${scientist.orcid}` : '#'}
        prefetch="intent"
        className={
          scientist.orcid
            ? 'text-lg font-normal leading-tight text-blue-600 transition-colors cursor-pointer hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300'
            : 'text-lg font-normal leading-tight text-gray-400 cursor-not-allowed dark:text-gray-600'
        }
        aria-disabled={!scientist.orcid}
        tabIndex={scientist.orcid ? 0 : -1}
        onClick={(e) => {
          if (!scientist.orcid) {
            e.preventDefault();
          } else {
            pingEvent(
              HHMITrackEvent.HHMI_COMPLIANCE_SCIENTIST_SELECTED,
              {
                scientistId: scientist.id,
                scientistName: scientist.fullName,
                scientistOrcid: scientist.orcid,
                totalPublications: scientist.publications.total + scientist.preprints.total,
              },
              { anonymous: true },
            );
          }
        }}
      >
        {scientist.fullName}
      </Link>
    </div>
  );
}

interface ScientistActionsProps {
  scientist: NormalizedScientist;
  baseUrl: string;
  onShareClick: () => void;
  pingEvent: (event: any, data: any, options?: any) => void;
  showShareButton?: boolean;
}

function ScientistActions({
  scientist,
  baseUrl,
  onShareClick,
  pingEvent,
  showShareButton = true,
}: ScientistActionsProps) {
  return (
    <div className="flex gap-1 items-center">
      <ui.Button
        variant="outline"
        disabled={!scientist.orcid}
        title={
          !scientist.orcid
            ? `No ORCID available for ${scientist.fullName ?? 'this scientist'}`
            : undefined
        }
      >
        <Link
          to={scientist.orcid ? `${baseUrl}/${scientist.orcid}` : '#'}
          prefetch="intent"
          tabIndex={scientist.orcid ? 0 : -1}
          aria-disabled={!scientist.orcid}
          className="flex gap-2 items-center"
          onClick={(e) => {
            if (!scientist.orcid) {
              e.preventDefault();
            } else {
              pingEvent(
                HHMITrackEvent.HHMI_COMPLIANCE_SCIENTIST_SELECTED,
                {
                  scientistId: scientist.id,
                  scientistName: scientist.fullName,
                  scientistOrcid: scientist.orcid,
                  totalPublications: scientist.publications.total + scientist.preprints.total,
                },
                { anonymous: true },
              );
            }
          }}
        >
          <CheckBadgeIcon className="w-5 h-5" />
          Compliance Dashboard
        </Link>
      </ui.Button>
      {showShareButton && (
        <ui.Button
          variant="outline"
          size="icon-sm"
          disabled={!scientist.orcid}
          onClick={(e) => {
            e.preventDefault();
            if (scientist.orcid) {
              onShareClick();
            }
          }}
          title={scientist.orcid ? 'Give Access to Someone' : 'No ORCID available'}
        >
          <UserPlus className="w-4 h-4 stroke-[1.5px]" />
        </ui.Button>
      )}
    </div>
  );
}

function ComplianceStatusBadge({
  scientist,
  align = 'left',
}: {
  scientist: NormalizedScientist;
  align?: 'left' | 'right';
}) {
  const { preprints, publications } = scientist;

  const totalPublications = (preprints?.total ?? 0) + (publications?.total ?? 0);
  const allCompliant = preprints?.nonCompliant === 0 && publications?.nonCompliant === 0;

  // Check if there are no publications at all
  if (totalPublications === 0) {
    return (
      <div
        className={cn('flex gap-1 justify-start items-center text-md', {
          'md:justify-end': align === 'right',
        })}
      >
        <span className="text-muted-foreground">No Published Work</span>
      </div>
    );
  }

  if (allCompliant) {
    return (
      <div
        className={cn('flex gap-[2px] justify-start items-center text-md', {
          'md:justify-end': align === 'right',
        })}
      >
        <Check className="w-[20px] h-[20px] stroke-[2.5] text-success" />
        <span className="font-medium text-success">Compliant</span>
      </div>
    );
  }

  const totalIssues = (preprints?.nonCompliant ?? 0) + (publications?.nonCompliant ?? 0);

  return (
    <div className="flex flex-col justify-start">
      <div
        className={cn('flex gap-1 justify-start items-center font-medium text-md', {
          'md:justify-end': align === 'right',
        })}
      >
        <span className="font-semibold text-red-700">{totalIssues}</span>
        <span className="text-red-800">{plural('Compliance issue(s)', totalIssues)}</span>
      </div>
    </div>
  );
}

// Individual scientist list item component
export function ScientistListItem({
  scientist,
  baseUrl = '/app/compliance/scientists',
  showShareButton = true,
}: {
  scientist: NormalizedScientist;
  baseUrl?: string;
  showShareButton?: boolean;
}) {
  const { preprints, publications } = scientist;
  const pingEvent = usePingEvent();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-4 w-full md:gap-2 md:grid-cols-3 md:flex-row">
      <div className="flex flex-col gap-2 w-full items-top">
        {/* Scientist Info */}
        <ScientistInfo scientist={scientist} baseUrl={baseUrl} pingEvent={pingEvent} />
        <ComplianceStatusBadge scientist={scientist} />
        <div className="flex flex-col gap-1 text-sm text-left text-muted-foreground">
          <div>
            {plural('%s preprint(s)', preprints?.total ?? 0)} ·{' '}
            {plural('%s journal article(s)', publications?.total ?? 0)}
          </div>
        </div>
      </div>
      <div className="flex">
        <div className="flex flex-col flex-wrap gap-1 w-full text-sm">
          <div className="flex gap-2 items-center">
            <Mail className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-300">{scientist.email}</span>
          </div>
          <div className="flex gap-2 items-center">
            <OrcidIcon className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-300">
              {scientist.orcid || 'No ORCID'}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 justify-between">
        {/* Action Button */}
        <div className="flex flex-shrink-0 justify-end">
          <ScientistActions
            scientist={scientist}
            baseUrl={baseUrl}
            onShareClick={() => setShareDialogOpen(true)}
            pingEvent={pingEvent}
            showShareButton={showShareButton}
          />
        </div>
      </div>
      {scientist.orcid && showShareButton && (
        <ShareReportDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          scientist={scientist}
          actionUrl="/app/compliance/scientists"
          compact={true}
        />
      )}
    </div>
  );
}
