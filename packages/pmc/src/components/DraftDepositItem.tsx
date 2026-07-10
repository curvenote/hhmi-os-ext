import { useState } from 'react';
import { useFetcher } from 'react-router';
import { Trash2, GitBranch } from 'lucide-react';
import { ui } from '@curvenote/scms-core';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog.js';
import type { DraftPMCDeposit } from '../backend/db.server.js';
import { formatDistanceToNow } from 'date-fns';

interface DraftDepositItemProps {
  deposit: DraftPMCDeposit;
  onDeleted: () => void;
  onResume: (workId: string, submissionVersionId: string) => void;
}

export function DraftDepositItem({ deposit, onDeleted, onResume }: DraftDepositItemProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const fetcher = useFetcher();

  const handleResume = () => {
    onResume(deposit.workId, deposit.submissionVersionId);
  };

  const timeAgo = formatDistanceToNow(new Date(deposit.dateModified), { addSuffix: true });
  const createdAgo = formatDistanceToNow(new Date(deposit.dateCreated), { addSuffix: true });

  return (
    <>
      <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col">
              <div className="text-sm font-medium text-muted-foreground">
                Last modified {timeAgo}
              </div>
              <div className="mb-3 text-xs text-muted-foreground">Created {createdAgo}</div>
            </div>
            <ui.Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowDeleteDialog(true)}
              className="text-red-600 hover:text-red-700"
              disabled={fetcher.state !== 'idle'}
            >
              <Trash2 className="w-4 h-4" />
            </ui.Button>
          </div>
          <div className="flex gap-2 items-center mb-1 min-w-0">
            <h3 className="text-base font-medium text-gray-900 truncate">{deposit.workTitle}</h3>
            {deposit.versionNumber > 0 ? (
              <ui.VersionTagBadge
                tag={`v${deposit.versionNumber}`}
                titlePrefix="Version"
                icon={GitBranch}
                className="shrink-0"
              />
            ) : null}
          </div>
          <div className="mb-1 text-sm text-muted-foreground">
            {deposit.completionStatus.completed} out of {deposit.completionStatus.total} tasks
            completed
          </div>
          <ui.Button
            onClick={handleResume}
            className="w-full mt-2"
            disabled={fetcher.state !== 'idle'}
          >
            Resume Deposit
          </ui.Button>
        </div>
      </div>

      <DeleteConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        workId={deposit.workId}
        workTitle={deposit.workTitle}
        onDeleted={onDeleted}
      />
    </>
  );
}
