import { ComplianceTextRenderer } from './ComplianceTextRenderer.js';
import type { WizardOutcome } from '../common/complianceTypes.js';
import { ui, cn, usePingEvent } from '@curvenote/scms-core';
import { BioRxivTaskCard } from '../BioRxivTaskCard.js';
import { NoticeToJournalsTaskCard } from '../NoticeToJournalsTaskCard.js';
import { getTasks } from '@hhmi/pmc/client';
import { HHMITrackEvent } from '../analytics/events.js';
import { useEffect, useRef } from 'react';

interface OutcomeDisplayProps {
  outcomes: WizardOutcome[];
  className?: string;
  noticeToJournalsPdfUrl?: string;
}

function DisplayAdvice({ outcome, index }: { outcome: WizardOutcome; index?: number }) {
  let alertType: ui.AlertProps['type'] = 'info';
  switch (outcome.subType) {
    case 'success':
      alertType = 'success';
      break;
    case 'info':
      alertType = 'info';
      break;
    case 'reminder':
    case 'warning':
      alertType = 'warning';
      break;
    case 'optional':
      alertType = 'neutral';
      break;
    default:
      alertType = 'info';
  }

  return (
    <ui.SimpleAlert
      type={alertType}
      numbered={index !== undefined ? index + 1 : undefined}
      message={
        <div className="flex flex-col">
          <div className="text-lg font-medium">{outcome.title}</div>
          <ComplianceTextRenderer className="text-inherit" text={outcome.text || ''} />
        </div>
      }
    />
  );
}

function DisplayBioRxivAction({ outcome, index }: { outcome: WizardOutcome; index?: number }) {
  return (
    <>
      <ui.SimpleAlert
        type={outcome.subType === 'optional' ? 'neutral' : 'info'}
        numbered={index !== undefined ? index + 1 : undefined}
        message={
          <div className="flex flex-col">
            <div className="text-lg font-medium">{outcome.title}</div>
            <ComplianceTextRenderer className="text-inherit" text={outcome.text || ''} />
          </div>
        }
      />
      <div className="flex justify-center mt-8">
        <BioRxivTaskCard />
      </div>
    </>
  );
}

function DisplayPMCDepositAction({ outcome, index }: { outcome: WizardOutcome; index?: number }) {
  const tasks = getTasks();
  const Component = tasks.find((task) => task.id === 'pmc-deposit')?.component;

  return (
    <>
      <ui.SimpleAlert
        type="info"
        numbered={index !== undefined ? index + 1 : undefined}
        message={
          <div className="flex flex-col">
            <div className="text-lg font-medium">{outcome.title}</div>
            <ComplianceTextRenderer className="text-inherit" text={outcome.text || ''} />
          </div>
        }
      />
      <div className="flex justify-center py-2 not-prose">
        <div className="w-[360px] mt-8">
          {Component && <Component />}
          {!Component && (
            <div className="p-4 text-center text-gray-500 border border-gray-300">
              Unable to display PMC deposit task card
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function ComplianceOutcomeDisplay({
  outcomes,
  className,
  noticeToJournalsPdfUrl,
}: OutcomeDisplayProps) {
  const pingEvent = usePingEvent();
  const hasTrackedOutcomeView = useRef(false);
  const previousOutcomesRef = useRef<string>('');

  // Track outcome viewing - fire every time outcomes change
  useEffect(() => {
    const currentOutcomesString = outcomes
      .map((o) => o.id)
      .sort()
      .join(',');

    if (currentOutcomesString !== previousOutcomesRef.current) {
      hasTrackedOutcomeView.current = false;
      previousOutcomesRef.current = currentOutcomesString;
    }

    if (!hasTrackedOutcomeView.current) {
      pingEvent(
        HHMITrackEvent.COMPLIANCE_WIZARD_OUTCOME_VIEWED,
        {
          outcomes: outcomes.map((o) => o.id),
          outcomeCount: outcomes.length,
        },
        { anonymous: true, ignoreAdmin: true },
      );
      hasTrackedOutcomeView.current = true;
    }
  }, [outcomes, pingEvent]);
  const renderOutcome = (outcome: WizardOutcome, index?: number) => {
    switch (outcome.id) {
      case 'figure_out_oa_status_and_come_back_later':
        return (
          <div>
            <DisplayAdvice outcome={outcome} index={index} />
          </div>
        );
      case 'not_sure_contact_oapolicy':
        return (
          <div className="max-w-4xl">
            <DisplayAdvice outcome={outcome} index={index} />
          </div>
        );
      case 'proceed_to_biorxiv_submission':
      case 'optional_proceed_to_biorxiv_submission':
        return (
          <div className="max-w-4xl">
            <DisplayBioRxivAction outcome={outcome} index={index} />
          </div>
        );
      case 'proceed_to_pmc_submission':
      case 'proceed_to_pmc_submission_hhmi_and_nih':
      case 'proceed_to_pmc_submission_nih':
      case 'reminder_to_come_back_later_to_submit_to_pmc':
      case 'optional_reminder_to_come_back_later_to_submit_to_pmc':
        return (
          <div className="max-w-4xl">
            <DisplayPMCDepositAction outcome={outcome} index={index} />
          </div>
        );
    }

    // Handle different outcome types
    switch (outcome.type) {
      case 'advice':
        return (
          <div className="max-w-4xl">
            <DisplayAdvice outcome={outcome} index={index} />
          </div>
        );
      default:
        console.warn('Unknown outcome', outcome);
        return null;
    }
  };

  return (
    <div className={cn('space-y-8', className)}>
      {outcomes.map((outcome, idx) => (
        <div key={outcome.id}>{renderOutcome(outcome, outcomes.length > 1 ? idx : undefined)}</div>
      ))}
      {noticeToJournalsPdfUrl && (
        <div className="max-w-4xl">
          <div className="flex justify-center pt-8 not-prose">
            <NoticeToJournalsTaskCard pdfUrl={noticeToJournalsPdfUrl} />
          </div>
        </div>
      )}
    </div>
  );
}
