import { useFetcher, useRevalidator } from 'react-router';
import type { WorkflowTransition, GeneralError } from '@curvenote/scms-core';
import { ui, usePolling } from '@curvenote/scms-core';
import { useEffect, useCallback, useState } from 'react';
import type { JobDTO } from '@curvenote/common';
import { JobStatus } from '@curvenote/scms-db';
import { zfd } from 'zod-form-data';
import { z } from 'zod';
import type { Prisma } from '@curvenote/scms-db';
import { EllipsisVertical } from 'lucide-react';
import { SplitButton } from './SplitButton.js';

interface SubmissionVersionTransitionInfo {
  id: string;
  transition?: WorkflowTransition | Prisma.JsonValue | null;
}

export function ActionsAreaActiveTransition({
  transition,
}: {
  transition: WorkflowTransition | Prisma.JsonValue | null | undefined;
}) {
  const t = transition as WorkflowTransition | null | undefined;
  if (!t) return null;
  return (
    <div className="flex gap-2 items-center animate-pulse">
      <ui.Dot />
      <div className="text-gray-400 text-sm pb-[1px]">
        {t.labels?.inProgress ?? 'in progress...'}
      </div>
    </div>
  );
}

interface ActionsAreaProps {
  transitions: WorkflowTransition[];
  submissionVersion: SubmissionVersionTransitionInfo;
  onError: (error: GeneralError | string | undefined) => void;
  formAction?: string;
  layout?: 'vertical' | 'horizontal';
  /** Kebab menu (compact) vs split primary + dropdown */
  actionDisplay?: 'menu' | 'splitButton';
  /** When set, in-progress transition is reported here instead of rendering inside the actions area */
  onActiveTransitionChange?: (transition: WorkflowTransition | null) => void;
}

export const TransitionFormSchema = zfd.formData({
  intent: zfd.text(z.literal('transition')),
  submissionVersionId: zfd.text(z.uuid()),
  transition: zfd.text(z.string().min(1)),
});

export function ActionsAreaForm({
  transitions,
  submissionVersion,
  onError,
  formAction,
  layout = 'vertical',
  actionDisplay = 'menu',
  onActiveTransitionChange,
}: ActionsAreaProps) {
  const [activeTransition, setActiveTransition] = useState<WorkflowTransition | null>(
    submissionVersion.transition as WorkflowTransition | null,
  );
  const revalidator = useRevalidator();

  // Reset when viewing a different submission version (avoids stale in-progress state)
  useEffect(() => {
    setActiveTransition(submissionVersion.transition as WorkflowTransition | null);
  }, [submissionVersion.id]);

  useEffect(() => {
    onActiveTransitionChange?.(activeTransition);
  }, [activeTransition, onActiveTransitionChange]);
  const fetcher = useFetcher<{
    success: boolean;
    item?: SubmissionVersionTransitionInfo;
    error?: GeneralError | string;
  }>();

  useEffect(() => {
    if (fetcher.data?.error) {
      let errorMessage: string;
      if (typeof fetcher.data.error === 'string') {
        errorMessage = fetcher.data.error;
      } else if (
        fetcher.data.error &&
        typeof fetcher.data.error === 'object' &&
        'message' in fetcher.data.error
      ) {
        errorMessage = fetcher.data.error.message;
      } else {
        errorMessage = 'An unknown error occurred';
      }
      ui.toastError(errorMessage);
    } else if (fetcher.data?.success && fetcher.data?.item) {
      const transition = fetcher.data.item.transition as WorkflowTransition;
      setActiveTransition(transition);

      if (!transition?.requiresJob) {
        ui.toastSuccess('Action completed successfully');
      }
    }
  }, [fetcher.data]);

  const jobId = activeTransition?.state?.jobId;
  const shouldPoll = activeTransition?.requiresJob && jobId;

  const handleJobComplete = useCallback(
    (job: JobDTO) => {
      if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
        setActiveTransition(null);
        revalidator.revalidate();

        if (job.status === JobStatus.COMPLETED) {
          ui.toastSuccess('Action completed successfully');
        } else if (job.status === JobStatus.FAILED) {
          const errorMessage = `Job failed: ${job.messages?.join(', ') || 'Unknown error'}`;
          ui.toastError(errorMessage);
        }
      }
    },
    [revalidator],
  );

  const handleJobError = useCallback((error: Error) => {
    const errorMessage = `Job polling error: ${error.message}`;
    ui.toastError(errorMessage);
  }, []);

  const shouldStopPolling = useCallback((job: JobDTO) => {
    return job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED;
  }, []);

  usePolling<JobDTO>({
    url: `/v1/jobs/${jobId}`,
    interval: 1500,
    enabled: !!shouldPoll,
    pollImmediately: false,
    numRetries: 8,
    shouldStop: shouldStopPolling,
    onComplete: handleJobComplete,
    onError: handleJobError,
  });

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingTransitionName, setPendingTransitionName] = useState<string | null>(null);

  const submitTransition = useCallback(
    (transitionName: string) => {
      onError(undefined);
      fetcher.submit(
        {
          intent: 'transition',
          submissionVersionId: submissionVersion.id,
          transition: transitionName,
        },
        { method: 'post', action: formAction },
      );
    },
    [fetcher, submissionVersion.id, formAction, onError],
  );

  const requestTransition = useCallback((transitionName: string) => {
    setPendingTransitionName(transitionName);
    setConfirmDialogOpen(true);
  }, []);

  const handleConfirmAction = useCallback(() => {
    if (pendingTransitionName) {
      submitTransition(pendingTransitionName);
      setPendingTransitionName(null);
      setConfirmDialogOpen(false);
    }
  }, [pendingTransitionName, submitTransition]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmDialogOpen(false);
    setPendingTransitionName(null);
  }, []);

  const pendingTransition = pendingTransitionName
    ? transitions.find((t) => t.name === pendingTransitionName)
    : null;
  const confirmMessage =
    pendingTransition?.labels?.confirmation ??
    'Are you sure you want to continue with this action?';
  const confirmActionLabel =
    pendingTransition?.labels?.action ?? pendingTransition?.labels?.button ?? 'Confirm';

  if (transitions.length === 0) {
    return <span className="text-gray-400">No actions</span>;
  }

  const disabled = fetcher.state !== 'idle' || !!activeTransition;

  const isHorizontal = layout === 'horizontal';

  const primary = transitions[0];
  const otherTransitions = transitions.slice(1);

  return (
    <div
      data-name="actions-area"
      className={`flex flex-col gap-2 ${isHorizontal ? 'flex-row justify-end items-center' : ''}`}
    >
      {actionDisplay === 'splitButton' ? (
        <SplitButton
          primaryLabel={primary.labels?.action || primary.name}
          primaryValue={primary.name}
          onPrimaryAction={requestTransition}
          otherActions={otherTransitions.map((t) => ({
            label: t.labels?.action || t.name,
            value: t.name,
          }))}
          onOptionSelect={requestTransition}
          disabled={disabled}
          busy={fetcher.state !== 'idle'}
          size="sm"
          className={isHorizontal ? 'max-w-md' : undefined}
        />
      ) : (
        <ui.Menu>
          <ui.MenuTrigger asChild>
            <ui.Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label="Actions"
            >
              <EllipsisVertical />
            </ui.Button>
          </ui.MenuTrigger>
          <ui.MenuContent align="end" sideOffset={4} className="min-w-[12rem]">
            {transitions.map((t) => (
              <ui.MenuItem
                key={t.name}
                disabled={disabled}
                onSelect={() => {
                  // Do not call preventDefault() — Radix closes the menu on select by default;
                  // preventDefault() would leave an uncontrolled menu open behind the dialog.
                  requestTransition(t.name);
                }}
                className="px-3 py-2 text-sm cursor-pointer"
              >
                {t.labels?.action || t.name}
              </ui.MenuItem>
            ))}
          </ui.MenuContent>
        </ui.Menu>
      )}
      <ui.Dialog
        open={confirmDialogOpen}
        onOpenChange={(open) => {
          setConfirmDialogOpen(open);
          if (!open) setPendingTransitionName(null);
        }}
      >
        <ui.DialogContent>
          <ui.DialogHeader>
            <ui.DialogTitle>Confirm action</ui.DialogTitle>
            <ui.DialogDescription>{confirmMessage}</ui.DialogDescription>
          </ui.DialogHeader>
          <ui.DialogFooter>
            <ui.Button variant="outline" onClick={handleCancelConfirm}>
              Cancel
            </ui.Button>
            <ui.Button onClick={handleConfirmAction}>{confirmActionLabel}</ui.Button>
          </ui.DialogFooter>
        </ui.DialogContent>
      </ui.Dialog>
    </div>
  );
}
