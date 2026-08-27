import { useFetcher, useRevalidator } from 'react-router';
import type { WorkflowTransition, GeneralError } from '@curvenote/scms-core';
import { ui, usePolling } from '@curvenote/scms-core';
import { useEffect, useCallback, useState, useRef } from 'react';
import type { JobDTO } from '@curvenote/common';
import { JobStatus } from '@curvenote/scms-db';
import { zfd } from 'zod-form-data';
import { z } from 'zod';
import type { Prisma } from '@curvenote/scms-db';
import { EllipsisVertical } from 'lucide-react';
import { SplitButton } from './SplitButton.js';
import {
  getTransitionJobId,
  resolveActiveTransitionAfterLoad,
  shouldPollJobTransition,
} from './jobTransitionPolling.js';

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
  display?: 'menu' | 'button';
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
  display = 'button',
  onActiveTransitionChange,
}: ActionsAreaProps) {
  const handledTerminalJobIdsRef = useRef<Set<string>>(new Set());
  const pendingOutcomeJobIdRef = useRef<string | null>(null);
  const awaitingRevalidateRef = useRef(false);
  const sawRevalidateLoadingRef = useRef(false);
  const toastedOutcomeJobIdsRef = useRef<Set<string>>(new Set());

  const [activeTransition, setActiveTransition] = useState<WorkflowTransition | null>(() =>
    resolveActiveTransitionAfterLoad(
      submissionVersion.transition as WorkflowTransition | null,
      handledTerminalJobIdsRef.current,
    ),
  );
  const revalidator = useRevalidator();

  // Sync from loader; never restore a transition for a job we already saw as terminal
  useEffect(() => {
    const incoming = submissionVersion.transition as WorkflowTransition | null;
    setActiveTransition(
      resolveActiveTransitionAfterLoad(incoming, handledTerminalJobIdsRef.current),
    );
  }, [submissionVersion.id, submissionVersion.transition]);

  // After COMPLETED job + revalidate: toast success only if transition cleared; otherwise warn once
  useEffect(() => {
    if (!awaitingRevalidateRef.current) return;

    if (revalidator.state === 'loading') {
      sawRevalidateLoadingRef.current = true;
      return;
    }
    if (revalidator.state !== 'idle' || !sawRevalidateLoadingRef.current) return;

    const jobId = pendingOutcomeJobIdRef.current;
    awaitingRevalidateRef.current = false;
    sawRevalidateLoadingRef.current = false;
    pendingOutcomeJobIdRef.current = null;
    if (!jobId || toastedOutcomeJobIdsRef.current.has(jobId)) return;
    toastedOutcomeJobIdsRef.current.add(jobId);

    const incoming = submissionVersion.transition as WorkflowTransition | null;
    if (getTransitionJobId(incoming) === jobId) {
      ui.toastError(
        'Deposit job finished but submission status was not updated. Refresh the page or contact support if this persists.',
      );
      setActiveTransition(null);
    } else {
      ui.toastSuccess('Action completed successfully');
    }
  }, [revalidator.state, submissionVersion.transition]);

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
      setActiveTransition(
        resolveActiveTransitionAfterLoad(transition, handledTerminalJobIdsRef.current),
      );

      if (!transition?.requiresJob) {
        ui.toastSuccess('Action completed successfully');
      }
    }
  }, [fetcher.data]);

  const jobId = getTransitionJobId(activeTransition);
  const shouldPoll = shouldPollJobTransition(activeTransition, handledTerminalJobIdsRef.current);

  const handleJobComplete = useCallback(
    (job: JobDTO) => {
      if (job.status !== JobStatus.COMPLETED && job.status !== JobStatus.FAILED) return;

      const completedJobId = job.id ?? jobId;
      if (completedJobId) {
        handledTerminalJobIdsRef.current.add(completedJobId);
      }
      setActiveTransition(null);

      if (job.status === JobStatus.FAILED) {
        const errorMessage = `Job failed: ${job.messages?.join(', ') || 'Unknown error'}`;
        ui.toastError(errorMessage);
        if (completedJobId) toastedOutcomeJobIdsRef.current.add(completedJobId);
        revalidator.revalidate();
        return;
      }

      // COMPLETED: wait for revalidate to see if status/transition actually advanced
      if (completedJobId) {
        pendingOutcomeJobIdRef.current = completedJobId;
        awaitingRevalidateRef.current = true;
      }
      revalidator.revalidate();
    },
    [revalidator, jobId],
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
    pollImmediately: true,
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
      {display === 'button' ? (
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
