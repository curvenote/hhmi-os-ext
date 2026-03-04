import { useFetcher, useRevalidator } from 'react-router';
import type { WorkflowTransition, GeneralError } from '@curvenote/scms-core';
import { ui, usePolling } from '@curvenote/scms-core';
import { useEffect, useCallback, useState } from 'react';
import type { JobDTO } from '@curvenote/common';
import { JobStatus } from '@curvenote/scms-db';
import { zfd } from 'zod-form-data';
import { z } from 'zod';
import type { Prisma } from '@curvenote/scms-db';
import { SplitButton, type SplitButtonOption } from './SplitButton.js';

interface SubmissionVersionTransitionInfo {
  id: string;
  transition?: WorkflowTransition | Prisma.JsonValue | null;
}

interface ActionsAreaProps {
  transitions: WorkflowTransition[];
  submissionVersion: SubmissionVersionTransitionInfo;
  onError: (error: GeneralError | string | undefined) => void;
  formAction?: string;
  layout?: 'vertical' | 'horizontal';
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
}: ActionsAreaProps) {
  const [activeTransition, setActiveTransition] = useState<WorkflowTransition | null>(
    submissionVersion.transition as WorkflowTransition | null,
  );
  const revalidator = useRevalidator();
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

  if (transitions.length === 0) {
    return <span className="text-gray-400">No actions</span>;
  }

  const primary = transitions[0];
  const otherActions: SplitButtonOption[] = transitions.slice(1).map((t) => ({
    label: t.labels?.action || t.name,
    value: t.name,
  }));

  const busy = fetcher.state !== 'idle' || !!activeTransition;
  const disabled = fetcher.state !== 'idle' || !!activeTransition;

  const isHorizontal = layout === 'horizontal';

  return (
    <div
      data-name="actions-area"
      className={`flex flex-col gap-2 ${isHorizontal ? 'flex-row items-center justify-end' : ''}`}
    >
      <SplitButton
        primaryLabel={primary.labels?.action || primary.name}
        primaryValue={primary.name}
        onPrimaryAction={submitTransition}
        otherActions={otherActions}
        onOptionSelect={submitTransition}
        disabled={disabled}
        busy={busy}
        size="sm"
      />
      {activeTransition && (
        <div className="flex gap-2 items-center animate-pulse">
          <ui.Dot />
          <div className="text-gray-400 text-sm pb-[1px]">
            {activeTransition.labels?.inProgress ?? 'in progress...'}
          </div>
        </div>
      )}
    </div>
  );
}
