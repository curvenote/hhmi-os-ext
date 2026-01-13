import { useState, useEffect, useCallback } from 'react';
import { useFetcher } from 'react-router';
import {
  ui,
  primitives,
  usePingEvent,
  InviteUserDialog,
  useDeploymentConfig,
} from '@curvenote/scms-core';
import { AlertCircle } from 'lucide-react';
import type { GeneralError } from '@curvenote/scms-core';
import { AccessGrantItem } from './AccessGrantItem.js';
import { ShareReportForm } from './ShareReportForm.js';
import { HHMITrackEvent } from '../analytics/events.js';
import { NormalizedScientist } from 'src/backend/types.js';

interface AccessGrant {
  id: string;
  date_created: string;
  receiver?: {
    display_name?: string | null;
    username?: string | null;
    email?: string | null;
  } | null;
}

interface ShareReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scientist: NormalizedScientist;
  actionUrl: string;
  compact?: boolean;
}

function LoadingSkeleton({ compact = false }: { compact?: boolean }) {
  const paddingClass = compact ? 'p-4' : 'p-6';
  const gapClass = compact ? 'gap-3' : 'gap-4';
  return (
    <div className={`flex flex-col ${gapClass}`}>
      <primitives.Card className={paddingClass}>
        <div className="flex flex-col gap-4">
          <div className="w-32 h-5 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <div className="mb-2 w-20 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
              <div className="w-full h-10 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
            </div>
            <div className="w-32 h-10 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
          </div>
        </div>
      </primitives.Card>
      <div className={`flex flex-col ${gapClass}`}>
        <div className="w-28 h-5 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
        <div className="h-20 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
      </div>
    </div>
  );
}

function ScientistNotFoundCard({
  compact = false,
  displayName,
}: {
  compact?: boolean;
  displayName?: string;
}) {
  const paddingClass = compact ? 'p-4' : 'p-6';
  return (
    <primitives.Card
      className={`bg-yellow-50 border-yellow-200 ${paddingClass} dark:bg-yellow-900/20 dark:border-yellow-800`}
    >
      <div className="flex gap-3 items-start">
        <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="mb-1 font-medium text-yellow-900 dark:text-yellow-100">
            {displayName ?? 'Scientist'} not found
          </h4>
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            {displayName ?? 'This scientist'} does not have a user account in the HHMI Workspace
            yet. They must create an account and link their ORCID before their compliance dashboard
            can be shared.
          </p>
        </div>
      </div>
    </primitives.Card>
  );
}

interface CurrentAccessListProps {
  grants: AccessGrant[];
  busy: boolean;
  actionUrl: string;
  compact?: boolean;
  onRevokeSuccess: () => void;
}

function AccessGrantItemSkeleton({ compact = false }: { compact?: boolean }) {
  const paddingClass = compact ? 'p-3' : 'p-4';
  return (
    <primitives.Card className={paddingClass}>
      <div
        className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'} sm:flex-row sm:items-center sm:justify-between`}
      >
        <div className="flex gap-3 items-center">
          <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse dark:bg-gray-700" />
          <div className="flex flex-col gap-2">
            <div className="w-32 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
            <div className="w-48 h-3 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="w-24 h-3 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
          <div className="w-20 h-8 bg-gray-200 rounded animate-pulse dark:bg-gray-700" />
        </div>
      </div>
    </primitives.Card>
  );
}

function CurrentAccessList({
  grants,
  busy,
  actionUrl,
  compact = false,
  onRevokeSuccess,
}: CurrentAccessListProps) {
  const paddingClass = compact ? 'p-4' : 'p-6';
  const gapClass = compact ? 'gap-3' : 'gap-4';

  return (
    <div className={`flex flex-col ${gapClass}`}>
      <h3 className={`font-medium ${compact ? 'text-sm' : 'text-md'}`}>Current Access</h3>
      {busy && grants.length === 0 && (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          <AccessGrantItemSkeleton compact={compact} />
        </div>
      )}
      {!busy && grants.length === 0 && (
        <primitives.Card className={`bg-gray-50 ${paddingClass} dark:bg-gray-900/50`}>
          <div className="text-sm text-center text-muted-foreground">
            <p>No one has access to this dashboard yet.</p>
            <p className="mt-1">Use the form above to share the dashboard with other users.</p>
          </div>
        </primitives.Card>
      )}
      {grants.length > 0 && (
        <>
          {busy && (
            <div className={compact ? 'space-y-2' : 'space-y-3'}>
              <AccessGrantItemSkeleton compact={compact} />
            </div>
          )}
          <div className={compact ? 'space-y-2' : 'space-y-3'}>
            {grants.map((grant) => (
              <AccessGrantItem
                key={grant.id}
                grant={grant}
                actionUrl={actionUrl}
                compact={compact}
                onRevokeSuccess={onRevokeSuccess}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ShareReportDialog({
  open,
  onOpenChange,
  scientist,
  actionUrl,
  compact = false,
}: ShareReportDialogProps) {
  const pingEvent = usePingEvent();
  const [grantsRequested, setGrantsRequested] = useState<boolean>(false);
  const [scientistExists, setScientistExists] = useState<boolean | null>(null);
  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([]);
  const [scientistEmail, setScientistEmail] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const config = useDeploymentConfig();
  const platformName = config.branding?.title || config.name || 'the workspace';

  // Fetcher for loading access grants
  const grantsFetcher = useFetcher<{
    exists: boolean;
    accessGrants: AccessGrant[];
    scientistName?: string | null;
    scientistEmail?: string | null;
    error?: GeneralError | string;
  }>();

  // Function to reload access grants
  const reloadGrants = useCallback(() => {
    if (grantsFetcher.state === 'idle') {
      const formData = new FormData();
      formData.append('intent', 'get-access-grants');
      formData.append('orcid', scientist.orcid);
      grantsFetcher.submit(formData, { method: 'POST', action: actionUrl });
    }
  }, [scientist.orcid, actionUrl]);

  // Load access grants when dialog opens
  useEffect(() => {
    if (open && !grantsRequested) {
      const formData = new FormData();
      formData.append('intent', 'get-access-grants');
      formData.append('orcid', scientist.orcid);
      grantsFetcher.submit(formData, { method: 'POST', action: actionUrl });
      setGrantsRequested(true);
    }
  }, [open, scientist.orcid, actionUrl, grantsFetcher]);

  // Update state when grants are loaded
  useEffect(() => {
    if (grantsFetcher.state === 'idle' && grantsFetcher.data) {
      if (grantsFetcher.data.error) return;
      setScientistExists(grantsFetcher.data.exists ?? false);
      setAccessGrants(grantsFetcher.data.accessGrants ?? []);
      setScientistEmail(grantsFetcher.data.scientistEmail ?? null);
    }
  }, [grantsFetcher.state, grantsFetcher.data]);

  // Handle share success - reload grants
  const handleShareSuccess = useCallback(() => {
    reloadGrants();
  }, [reloadGrants]);

  const handleDialogOpenChange = (dialogOpen: boolean) => {
    if (!dialogOpen) {
      pingEvent(
        HHMITrackEvent.HHMI_COMPLIANCE_REPORT_SHARE_MODAL_CLOSED,
        {
          orcid: scientist.orcid,
          scientistName: scientist.fullName,
          closeMethod: 'x-button-or-click-outside-or-escape',
        },
        { anonymous: true },
      );
    }
    onOpenChange(dialogOpen);
  };

  const displayName = scientist.fullName || `ORCID ${scientist.orcid}`;
  const gapClass = compact ? 'gap-6' : 'gap-8';

  let content = null;
  if (scientistExists === null) {
    content = <LoadingSkeleton compact={compact} />;
  } else if (scientistExists === false) {
    content = (
      <div className={`flex flex-col ${gapClass}`}>
        <ScientistNotFoundCard compact={compact} displayName={displayName} />
        <div className="flex justify-center">
          <ui.Button
            className="cursor-pointer"
            type="button"
            variant="default"
            size={compact ? 'sm' : 'default'}
            onClick={() => setInviteDialogOpen(true)}
          >
            Invite {displayName} to the {platformName}
          </ui.Button>
        </div>
      </div>
    );
  } else {
    content = (
      <div className={`flex flex-col ${gapClass}`}>
        <ShareReportForm
          actionUrl={actionUrl}
          compact={compact}
          onSuccess={handleShareSuccess}
          additionalFields={orcid ? { orcid } : undefined}
          description={
            !compact
              ? 'Search and select a user to share this compliance dashboard with. They will be able to view the compliance data and publications.'
              : undefined
          }
        />
        <CurrentAccessList
          grants={accessGrants}
          busy={grantsFetcher.state === 'loading'}
          actionUrl={actionUrl}
          compact={compact}
          onRevokeSuccess={reloadGrants}
        />
      </div>
    );
  }
  return (
    <>
      <ui.Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <ui.DialogContent variant="wide" className="max-h-[75vh] overflow-y-auto">
          <ui.DialogHeader>
            <ui.DialogTitle>Grant access to this user's dashboard</ui.DialogTitle>
            <ui.DialogDescription>
              Manage access to {displayName}'s compliance dashboard
            </ui.DialogDescription>
          </ui.DialogHeader>
          {content}
        </ui.DialogContent>
      </ui.Dialog>
      <InviteUserDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        actionUrl={actionUrl}
        platformName={platformName}
        title={`Invite ${displayName} to ${platformName}`}
        description="Send an invitation email to this scientist so they can join the workspace and link their ORCID to access their compliance dashboard."
        successMessage="Invitation sent successfully. They will receive an email with instructions to join and link their ORCID."
        context={scientist.orcid ? { orcid: scientist.orcid } : undefined}
        initialEmail={scientist.email || undefined}
      />
    </>
  );
}
