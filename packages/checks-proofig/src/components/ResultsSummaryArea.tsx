import { Logos } from '../client.js';
import type { ProofigDataSchema } from '../schema.js';
import { getProofigResultDisplayState } from '../utils/proofigSummary.js';
import { plural, ui } from '@curvenote/scms-core';
import { MissingReportUrlIcon } from './MissingReportUrlIcon.js';
import { ReportNoLongerAvailable } from './ReportNoLongerAvailable.js';
import { ProofigSubimageApprovalReportLink } from './ProofigSubimageApprovalReportLink.js';
import { ProofigReportPdfActions } from './ProofigReportPdfActions.js';
import { CheckItemHeadline } from './CheckItemHeadline.js';

const COLORS = {
  total: {
    bg: 'bg-blue-600 dark:bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-600 dark:border-blue-400',
  },
  review: {
    bg: 'bg-amber-700',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-700 dark:border-amber-400',
  },
  good: {
    bg: 'bg-[#1B8364] dark:bg-[#22966f]',
    text: 'text-[#1B8364] dark:text-[#5cd09a]',
    border: 'border-[#1B8364] dark:border-[#5cd09a]',
  },
  notBad: {
    bg: 'bg-green-800/60 dark:bg-green-700/50',
    text: 'text-green-800/80 dark:text-green-400/90',
    border: 'border-green-800/70 dark:border-green-500/80',
  },
  bad: {
    bg: 'bg-[#9B1E1E] dark:bg-[#c02626]',
    text: 'text-[#9B1E1E] dark:text-red-400',
    border: 'border-[#9B1E1E] dark:border-red-400',
  },
  inspection: {
    bg: 'bg-[#9B1E1E]/70 dark:bg-[#c02626]/65',
    text: 'text-[#9B1E1E]/80 dark:text-red-400/85',
    border: 'border-[#9B1E1E]/70 dark:border-red-400/75',
  },
};

export function ResultsSummaryArea({
  proofigData,
  workVersionId,
  checkRunId,
  remoteStatusActionPath,
}: {
  proofigData: ProofigDataSchema | undefined;
  workVersionId?: string;
  checkRunId?: string;
  remoteStatusActionPath?: string;
}) {
  const resultDisplayState = getProofigResultDisplayState(proofigData);
  const {
    total,
    matchesReview,
    matchesNotBad,
    matchesReport: matchedReport,
    inspectsReport: inspectReport,
  } = resultDisplayState.counts;
  const awaitingHumanReview = resultDisplayState.kind === 'awaiting-review';
  const reportUrl = proofigData?.reportUrl;
  const deleted = proofigData?.deleted;
  const showViewReportButton = !!reportUrl && !deleted && matchesReview > 0;

  /** Matches `CheckItemHeadline` “All Clear” branch: no flagged or confirmed issues. */
  const isAllClear = resultDisplayState.kind === 'all-clear';
  const hidePunchcardAndLegend = isAllClear && total < 10;

  const punchcard = [
    {
      className: COLORS.bad.bg,
      count: inspectReport,
      altText: 'Additional sub-images flagged as problems manually',
    },
    {
      className: COLORS.bad.bg,
      count: matchedReport,
      altText: 'Flagged by Proofig and marked as problems',
    },
    {
      className: awaitingHumanReview ? COLORS.review.bg : COLORS.notBad.bg,
      count: awaitingHumanReview ? matchesReview : matchesNotBad,
      altText: awaitingHumanReview
        ? 'Issues flagged by Proofig and awaiting review'
        : 'Issues were flagged but not confirmed as problems',
    },
    {
      className: COLORS.good.bg,
      count: total - matchesNotBad,
      altText: 'No issues detected',
    },
  ];

  const legend = [];
  if (matchesReview > 0 || matchedReport > 0 || inspectReport > 0) {
    legend.push({
      value: total,
      label: 'Number of figure sub-images',
      textColor: COLORS.total.text,
      borderColor: COLORS.total.border,
    });
  }

  if (awaitingHumanReview) {
    legend.push({
      value: matchesReview,
      label: 'Issues flagged by Proofig and awaiting review',
      textColor: COLORS.review.text,
      borderColor: COLORS.review.border,
    });
  } else {
    if (matchesNotBad > 0) {
      legend.push({
        value: matchesNotBad,
        label: plural('Sub-image(s) flagged by Proofig but not confirmed', matchesNotBad),
        textColor: COLORS.notBad.text,
        borderColor: COLORS.notBad.border,
      });
    }
    if (matchedReport > 0) {
      legend.push({
        value: matchedReport,
        label: plural('Flagged by Proofig and marked as (a|) problem(s)', matchedReport),
        textColor: COLORS.bad.text,
        borderColor: COLORS.bad.border,
      });
    }
    if (inspectReport > 0) {
      legend.push({
        value: inspectReport,
        label: plural('Sub-image(s) manually marked as (a|) problem(s)', inspectReport),
        textColor: COLORS.bad.text,
        borderColor: COLORS.bad.border,
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-6">
        <CheckItemHeadline
          colors={{
            problem: COLORS.bad.text,
            clear: COLORS.good.text,
            review: COLORS.review.text,
          }}
          displayState={resultDisplayState}
        />
        {!hidePunchcardAndLegend ? (
          <>
            <ui.CheckItemPunchcard stats={punchcard} />
            <ui.CheckItemLegend stats={legend} />
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 items-center w-full min-w-0">
        {deleted ? (
          <ReportNoLongerAvailable />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 items-center min-w-0">
              {showViewReportButton ? (
                <>
                  {!proofigData?.reportUrl && <MissingReportUrlIcon />}
                  <ProofigSubimageApprovalReportLink
                    reportUrl={reportUrl}
                    actionPath={remoteStatusActionPath}
                    workVersionId={workVersionId}
                    checkRunId={checkRunId}
                    disabled={!reportUrl}
                    followUpDialogTitle="Proofig was opened for results review"
                    followUpDialogDescription="Your report was opened in a new tab at Proofig. When you have finished reviewing there, press Continue below to close this dialog and fetch the latest status."
                  >
                    <div className="flex gap-2 items-center">
                      <div>Review results at</div>
                      <Logos.LogoMono className="h-7" />
                    </div>
                  </ProofigSubimageApprovalReportLink>
                </>
              ) : (
                <Logos.LogoThemed className="h-7 shrink-0" />
              )}
            </div>
            <div className="flex-1 min-h-px min-w-4 basis-4" aria-hidden />
            <div className="flex flex-wrap gap-2 justify-end items-center">
              <ProofigReportPdfActions
                proofigData={proofigData}
                workVersionId={workVersionId}
                checkRunId={checkRunId}
                actionPath={remoteStatusActionPath}
                includeRemoteRefresh
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
