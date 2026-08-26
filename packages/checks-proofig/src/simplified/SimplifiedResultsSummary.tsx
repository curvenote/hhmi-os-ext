import type { ReactNode } from 'react';
import type { ProofigDataSchema } from '../schema.js';
import { getProofigResultDisplayState } from '../utils/proofigSummary.js';
import { plural } from '@curvenote/scms-core';
import { LogoMono } from '../icons.js';
import { ReportNoLongerAvailable } from '../components/ReportNoLongerAvailable.js';
import { ProofigOpenReportButton } from '../components/ProofigOpenReportButton.js';
import { ProofigReportPdfActions } from '../components/ProofigReportPdfActions.js';

const REVIEW = 'text-amber-700 dark:text-amber-300';
const CLEAR = 'text-[#1B8364] dark:text-[#5cd09a]';
const PROBLEM = 'text-[#9B1E1E] dark:text-red-400';

export function SimplifiedResultsSummary({
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
  const { total, matchesReview, matchesNotBad, matchesReport, inspectsReport, bad } =
    resultDisplayState.counts;
  const awaitingHumanReview = resultDisplayState.kind === 'awaiting-review';
  const reportUrl = proofigData?.reportUrl;
  const deleted = proofigData?.deleted;
  const showOpenReport = !!reportUrl && !deleted && matchesReview > 0;

  const hasPartialReportWhileAwaiting =
    awaitingHumanReview && (matchesReport > 0 || inspectsReport > 0);

  const footer =
    total === 0 ? null : awaitingHumanReview ? (
      <span>
        Total: {total}
        {' · '}
        Awaiting review: {matchesReview}
        {hasPartialReportWhileAwaiting && (
          <>
            {matchesReport > 0 && (
              <>
                {' · '}
                {plural('Confirmed problem(s)', matchesReport)}: {matchesReport}
              </>
            )}
            {inspectsReport > 0 && (
              <>
                {' · '}
                {plural('Manual (a|) problem(s)', inspectsReport)}: {inspectsReport}
              </>
            )}
          </>
        )}
      </span>
    ) : (
      <span>
        Total: {total}
        {' · '}
        Matches reviewed: {matchesReview}
        {matchesNotBad > 0 && (
          <>
            {' · '}
            {plural('Not confirmed as (a|) problem(s)', matchesNotBad)}: {matchesNotBad}
          </>
        )}
        {matchesReport > 0 && (
          <>
            {' · '}
            {plural('Confirmed problem(s)', matchesReport)}: {matchesReport}
          </>
        )}
        {inspectsReport > 0 && (
          <>
            {' · '}
            {plural('Manual (a|) problem(s)', inspectsReport)}: {inspectsReport}
          </>
        )}
      </span>
    );

  let body: ReactNode;
  if (total === 0) {
    body = (
      <div className="space-y-1">
        <div className="text-3xl font-medium text-muted-foreground">No sub-images</div>
        <div className="text-sm text-muted-foreground">No figures were detected.</div>
      </div>
    );
  } else if (resultDisplayState.kind === 'awaiting-review') {
    body = (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2 items-baseline">
          <div className={`text-3xl font-medium ${REVIEW}`}>
            {matchesNotBad}
            <span className="font-extralight text-gray-500 dark:text-gray-400">/{total}</span>
          </div>
          <div className={`text-3xl font-medium ${REVIEW}`}>Awaiting review</div>
        </div>
        <div className="text-sm text-muted-foreground">
          {`${plural('(An|Some) sub-image(s) (has|have) been flagged ', matchesReport)}`}by Proofig,
          these should be reviewed and any confirmed problems added to the report.
        </div>
      </div>
    );
  } else if (resultDisplayState.kind === 'all-clear') {
    body = (
      <div className="space-y-1">
        <div className={`text-3xl font-medium ${CLEAR}`}>All Clear</div>
        <div className="text-base font-bold">No issues flagged with your figures</div>
      </div>
    );
  } else if (resultDisplayState.kind === 'manual-problems') {
    body = (
      <div className="space-y-1">
        <div className={`text-3xl font-medium ${PROBLEM}`}>
          {plural('%s Problem(s)', inspectsReport)}
        </div>
        <div className="text-base font-bold text-muted-foreground">
          {plural(
            'No issues found by Proofig but %s problem(s) found by manual inspection',
            inspectsReport,
          )}
        </div>
      </div>
    );
  } else if (resultDisplayState.kind === 'confirmed-all-clear') {
    body = (
      <div className="space-y-1">
        <div className={`text-3xl font-medium ${CLEAR}`}>Confirmed All Clear</div>
        <div className="text-base font-bold text-muted-foreground">
          Potential issues were flagged by Proofig but none were confirmed as problems during
          review.
        </div>
      </div>
    );
  } else if (matchesReport > 0 && inspectsReport === 0) {
    body = (
      <div className="space-y-1">
        <div className={`text-3xl font-medium ${PROBLEM}`}>
          {plural('%s Problem(s)', matchesReport)}
        </div>
        <div className={`text-base font-bold ${PROBLEM}`}>
          {plural(
            '%s sub-image(s) flagged by Proofig (was|were) confirmed as having (a|) problem(s)',
            matchesReport,
          )}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-1">
        <div className={`text-3xl font-medium ${PROBLEM}`}>{plural('%s Problem(s)', bad)}</div>
        <div className={`text-base font-bold ${PROBLEM}`}>
          {plural(
            '%s sub-images(s) flagged by Proofig (was|were) confirmed as (a|) problem(s)',
            matchesReport,
          )}
          {inspectsReport > 0
            ? `, ${plural('%s additional sub-image(s) (has|have) problems', inspectsReport)} found by manual inspection.`
            : '.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {body}
      {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
        {deleted ? (
          <ReportNoLongerAvailable />
        ) : (
          <div className="flex flex-wrap gap-2 items-center w-full min-w-0">
            <div className="flex flex-wrap gap-2 items-center min-w-0">
              {showOpenReport ? (
                <ProofigOpenReportButton
                  reportUrl={reportUrl!}
                  actionPath={remoteStatusActionPath}
                  workVersionId={workVersionId}
                  checkRunId={checkRunId}
                >
                  <span className="flex gap-2 items-center">
                    <span>Open report in</span>
                    <LogoMono className="h-7" />
                  </span>
                </ProofigOpenReportButton>
              ) : null}
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
          </div>
        )}
      </div>
    </div>
  );
}
