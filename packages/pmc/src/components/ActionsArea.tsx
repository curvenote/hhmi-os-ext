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
  decideStuckTransitionCheck,
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
  const pendingStuckJobIdRef = useRef<string | null>(null);
  const loaderEpochRef = useRef(0);
  const loaderEpochAtCompleteRef = useRef(0);
  const toastedStuckJobIdsRef = useRef<Set<string>>(new Set());
  const sawRevalidateLoadingRef = useRef(false);
  const [outcomeEpoch, setOutcomeEpoch] = useState(0);

  const [activeTransition, setActiveTransition] = useState<WorkflowTransition | null>(() =>
    resolveActiveTransitionAfterLoad(
      submissionVersion.transition as WorkflowTransition | null,
      handledTerminalJobIdsRef.current,
    ),
  );
  const revalidator = useRevalidator();

  const bumpLoaderEpoch = useCallback(() => {
    loaderEpochRef.current += 1;
    setOutcomeEpoch(loaderEpochRef.current);
  }, []);

  // Advance epoch when loader transition identity changes
  useEffect(() => {
    bumpLoaderEpoch();
  }, [submissionVersion.id, submissionVersion.transition, bumpLoaderEpoch]);

  // Also advance epoch when a revalidation finishes while we are watching for a stuck transition
  useEffect(() => {
    if (!pendingStuckJobIdRef.current) {
      sawRevalidateLoadingRef.current = false;
      return;
    }
    if (revalidator.state === 'loading') {
      sawRevalidateLoadingRef.current = true;
      return;
    }
    if (revalidator.state === 'idle' && sawRevalidateLoadingRef.current) {
      sawRevalidateLoadingRef.current = false;
      bumpLoaderEpoch();
    }
  }, [revalidator.state, bumpLoaderEpoch]);

  // Sync from loader; never restore a transition for a job we already saw as terminal
  useEffect(() => {
    const incoming = submissionVersion.transition as WorkflowTransition | null;
    setActiveTransition(
      resolveActiveTransitionAfterLoad(incoming, handledTerminalJobIdsRef.current),
    );
  }, [submissionVersion.id, submissionVersion.transition]);

  // Stuck check only — success toast is fired immediately on job COMPLETED
  useEffect(() => {
    const jobId = pendingStuckJobIdRef.current;
    if (!jobId || toastedStuckJobIdsRef.current.has(jobId)) return;

    const outcome = decideStuckTransitionCheck({
      completedJobId: jobId,
      loaderTransition: submissionVersion.transition as WorkflowTransition | null,
      loaderEpochAtComplete: loaderEpochAtCompleteRef.current,
      currentLoaderEpoch: loaderEpochRef.current,
      minEpochsForStuck: 2,
    });
    if (outcome === 'pending') return;

    pendingStuckJobIdRef.current = null;
    if (outcome === 'cleared') return;

    toastedStuckJobIdsRef.current.add(jobId);
    setActiveTransition(null);
    ui.toastError(
      'Deposit job finished but submission status was not updated. Refresh the page or contact support if this persists.',
    );
  }, [submissionVersion.id, submissionVersion.transition, outcomeEpoch]);

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
        revalidator.revalidate();
        return;
      }

      // Success is based on the job finishing; stuck detection is a separate follow-up
      ui.toastSuccess('Action completed successfully');
      if (completedJobId) {
        pendingStuckJobIdRef.current = completedJobId;
        loaderEpochAtCompleteRef.current = loaderEpochRef.current;
      }
      revalidator.revalidate();
      // Second look after settle — bumps epoch via loading→idle even if transition stays null
      window.setTimeout(() => {
        if (pendingStuckJobIdRef.current === completedJobId) {
          revalidator.revalidate();
        }
      }, 400);
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
