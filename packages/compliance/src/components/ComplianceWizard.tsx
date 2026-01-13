import { Wizard, type WizardConfig } from '@curvenote/scms-core';
import { ComplianceWizardQuestion } from './ComplianceWizardQuestion.js';
import { ComplianceOutcomeDisplay } from './ComplianceOutcomeDisplay.js';
import type { ComplianceWizardConfig, ComplianceWizardState } from '../common/complianceTypes.js';
import { createComplianceWizardLogic } from '../common/complianceWizardLogic.js';
import { SectionWithHeading, usePingEvent, ui } from '@curvenote/scms-core';
import { ListTodo, CircleCheck } from 'lucide-react';
import { useNavigate, useBlocker, useFetcher } from 'react-router';
import { HHMITrackEvent } from '../analytics/events.js';
import { useEffect, useRef, useState } from 'react';

interface ComplianceWizardProps {
  config: ComplianceWizardConfig;
}

/**
 * ComplianceWizard: Compliance-specific wrapper for the generic Wizard component
 *
 * Provides compliance-specific question rendering, outcome display, and business logic
 * while leveraging the generic wizard orchestration for consistent behavior.
 */
export function ComplianceWizard({ config }: ComplianceWizardProps) {
  const navigate = useNavigate();
  const pingEvent = usePingEvent();
  const fetcher = useFetcher();
  const hasTrackedStart = useRef(false);
  const hasTrackedCompleted = useRef(false);
  const hasFeedbackBeenGiven = useRef(false);
  const wizardStateRef = useRef<ComplianceWizardState | null>(null);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showHelpRequestForm, setShowHelpRequestForm] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [includeResponses, setIncludeResponses] = useState(true);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  useEffect(() => {
    if (!hasTrackedStart.current) {
      pingEvent(
        HHMITrackEvent.COMPLIANCE_WIZARD_STARTED,
        {},
        { anonymous: true, ignoreAdmin: true },
      );
      hasTrackedStart.current = true;
    }
  }, [pingEvent]);

  // Block navigation if wizard is completed and feedback hasn't been given
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasTrackedCompleted.current &&
      !hasFeedbackBeenGiven.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  // Show dialog when navigation is blocked
  useEffect(() => {
    if (blocker.state === 'blocked') {
      setPendingNavigation(blocker.location.pathname);
      setShowFeedbackDialog(true);
    }
  }, [blocker]);

  // Create the generic wizard configuration with compliance-specific logic
  const wizardConfig: WizardConfig<ComplianceWizardState> = {
    questions: config.questions,
    questionOrder: config.questionOrder || [
      'hhmiPolicy',
      'nihPolicy',
      'publishingStage',
      'openAccess',
      'ccLicense',
    ],
    outcomes: config.outcomes,
    logic: createComplianceWizardLogic(config),
  };

  // Question renderer with compliance-specific styling and behavior
  const questionRenderer = ({ question, value, onChange, disabled }: any) => (
    <ComplianceWizardQuestion
      containerClassName="max-w-4xl"
      question={question}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );

  // Outcome renderer with compliance-specific layout and actions
  const outcomeRenderer = (outcomes: any[]) => (
    <SectionWithHeading
      heading={
        <div id="compliance-wizard-outcomes-heading" className="max-w-4xl text-xl">
          Next Steps
        </div>
      }
      icon={<ListTodo />}
      className="min-h-[100vh] flex flex-col justify-center"
    >
      <div data-name="compliance-wizard-outcome-display" className="py-8">
        <ComplianceOutcomeDisplay outcomes={outcomes} />
      </div>
    </SectionWithHeading>
  );

  const handleFinish = () => {
    pingEvent(HHMITrackEvent.COMPLIANCE_WIZARD_FINISHED, {}, { anonymous: true });
    // Show feedback dialog before navigating
    if (hasTrackedCompleted.current) {
      setPendingNavigation('/app/works');
      setShowFeedbackDialog(true);
    } else {
      navigate('/app/works');
    }
  };

  const handleComplete = (state: ComplianceWizardState, outcomes: string[]) => {
    // Store the wizard state for potential help request
    wizardStateRef.current = state;

    if (!hasTrackedCompleted.current) {
      pingEvent(
        HHMITrackEvent.COMPLIANCE_WIZARD_COMPLETED,
        { outcomes, state },
        { anonymous: true, ignoreAdmin: true },
      );
      hasTrackedCompleted.current = true;
    }
  };

  const handleFeedbackYes = () => {
    pingEvent(
      HHMITrackEvent.COMPLIANCE_WIZARD_CONFIRM_USEFUL,
      {},
      { anonymous: true, ignoreAdmin: true },
    );
    hasFeedbackBeenGiven.current = true;
    setShowFeedbackDialog(false);
    if (pendingNavigation) {
      if (blocker.state === 'blocked') {
        blocker.proceed();
      } else {
        navigate(pendingNavigation);
      }
      setPendingNavigation(null);
    }
  };

  const handleFeedbackNo = () => {
    pingEvent(
      HHMITrackEvent.COMPLIANCE_WIZARD_CONFIRM_NEED_HELP,
      {},
      { anonymous: true, ignoreAdmin: true },
    );
    // Show help request form instead of closing
    setShowHelpRequestForm(true);
  };

  const handleDialogClose = () => {
    // User closed dialog without answering - reset blocker and mark feedback as given
    hasFeedbackBeenGiven.current = true;
    setShowFeedbackDialog(false);
    setShowHelpRequestForm(false);
    setShowSuccessMessage(false);
    setAdditionalInfo('');
    setPendingNavigation(null);
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  };

  const handleSuccessClose = () => {
    // Close success message and navigate away
    setShowFeedbackDialog(false);
    setShowSuccessMessage(false);
    if (pendingNavigation) {
      if (blocker.state === 'blocked') {
        blocker.proceed();
      } else {
        navigate(pendingNavigation);
      }
      setPendingNavigation(null);
    }
  };

  const handleHelpRequestCloseWithoutSending = () => {
    // Cancel help request - mark feedback as given to prevent infinite loop
    hasFeedbackBeenGiven.current = true;
    setShowFeedbackDialog(false);
    setShowHelpRequestForm(false);
    setShowSuccessMessage(false);
    setAdditionalInfo('');
    // Navigate away in the same way as when user answers yes
    if (pendingNavigation) {
      if (blocker.state === 'blocked') {
        blocker.proceed();
      } else {
        navigate(pendingNavigation);
      }
      setPendingNavigation(null);
    } else if (blocker.state === 'blocked') {
      blocker.reset();
    }
  };

  const handleHelpRequestSubmit = () => {
    // Track help request submission
    pingEvent(
      HHMITrackEvent.COMPLIANCE_WIZARD_HELP_REQUEST_SUBMITTED,
      { hasAdditionalInfo: !!additionalInfo, includeResponses },
      { anonymous: true, ignoreAdmin: true },
    );

    // Submit the form
    const formData = new FormData();
    formData.append('additionalInfo', additionalInfo);
    formData.append('includeResponses', includeResponses ? 'true' : 'false');
    if (includeResponses && wizardStateRef.current) {
      formData.append('wizardState', JSON.stringify(wizardStateRef.current));
    }
    fetcher.submit(formData, { method: 'post' });
  };

  // Handle successful form submission - show success state
  useEffect(() => {
    if (
      fetcher.state === 'idle' &&
      fetcher.data &&
      typeof fetcher.data === 'object' &&
      'success' in fetcher.data &&
      fetcher.data.success
    ) {
      hasFeedbackBeenGiven.current = true;
      setShowHelpRequestForm(false);
      setAdditionalInfo('');
      setShowSuccessMessage(true);
      // Don't navigate yet - wait for user to close the success message
    }
  }, [fetcher.state, fetcher.data]);

  const handleStartOver = () => {
    pingEvent(
      HHMITrackEvent.COMPLIANCE_WIZARD_RESTARTED,
      {},
      { anonymous: true, ignoreAdmin: true },
    );
  };

  const handleStillNeedHelp = () => {
    pingEvent(
      HHMITrackEvent.COMPLIANCE_WIZARD_HELP_LINK_CLICKED,
      {},
      { anonymous: true, ignoreAdmin: true },
    );
    // Open the feedback dialog and skip directly to the help request form
    // Set pending navigation so we navigate away after submission (like Finish does)
    setPendingNavigation('/app/works');
    setShowFeedbackDialog(true);
    setShowHelpRequestForm(true);
  };

  return (
    <>
      <Wizard
        progressClassName="max-w-4xl"
        config={wizardConfig}
        questionRenderer={questionRenderer}
        outcomeRenderer={outcomeRenderer}
        onFinish={handleFinish}
        onComplete={handleComplete}
        onStartOver={handleStartOver}
        completionScrollTarget="#compliance-wizard-outcomes-heading"
        renderAdditionalControls={(isCompleted) =>
          isCompleted ? (
            <div className="inline-flex self-center text-sm">
              <button
                type="button"
                onClick={handleStillNeedHelp}
                className="inline-flex px-0 py-0 font-normal bg-transparent border-none cursor-pointer text-primary underline-offset-4 hover:underline"
              >
                I still need help
              </button>
            </div>
          ) : null
        }
      />

      {showSuccessMessage ? (
        <ui.SimpleDialog
          open={showFeedbackDialog}
          onOpenChange={handleDialogClose}
          footerButtons={[{ label: 'Close', onClick: handleSuccessClose }]}
        >
          <div className="flex flex-col items-center py-6">
            <CircleCheck className="mb-4 w-16 h-16 text-green-600" />
            <h2 className="text-lg font-semibold leading-none text-center">Request Sent</h2>
            <p className="mt-2 text-base text-center text-muted-foreground">
              Your request has been sent to the HHMI Open Science Team. We'll get back to you as
              soon as possible.
            </p>
          </div>
        </ui.SimpleDialog>
      ) : !showHelpRequestForm ? (
        <ui.SimpleDialog
          open={showFeedbackDialog}
          onOpenChange={handleDialogClose}
          title="Did the questionnaire answer all of your questions?"
          description="Your feedback helps us improve the compliance questionnaire experience."
          footerButtons={[
            { label: 'No', onClick: handleFeedbackNo, variant: 'outline' },
            { label: 'Yes', onClick: handleFeedbackYes, variant: 'outline' },
          ]}
        />
      ) : (
        <ui.SimpleDialog
          open={showFeedbackDialog}
          onOpenChange={handleDialogClose}
          title="Request Help from the Open Science Support Team"
          description="Sending this request will include your name and email address so we can respond to you."
          footer={
            <>
              <ui.Button
                variant="outline"
                onClick={handleHelpRequestCloseWithoutSending}
                disabled={fetcher.state === 'submitting'}
              >
                Close (without sending)
              </ui.Button>
              <ui.Button
                onClick={handleHelpRequestSubmit}
                disabled={fetcher.state === 'submitting'}
              >
                {fetcher.state === 'submitting' ? 'Sending...' : 'Send'}
              </ui.Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <ui.Label htmlFor="additionalInfo" className="text-sm font-medium">
                Additional Information (optional)
              </ui.Label>
              <div className="mt-2">
                <ui.LimitedTextarea
                  id="additionalInfo"
                  value={additionalInfo}
                  onChange={setAdditionalInfo}
                  placeholder="Please tell us more about what you need help with..."
                  className="min-h-[120px]"
                  maxLength={2000}
                  disabled={fetcher.state === 'submitting'}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <ui.Checkbox
                id="includeResponses"
                checked={includeResponses}
                onCheckedChange={(checked) => setIncludeResponses(checked === true)}
                disabled={fetcher.state === 'submitting'}
              />
              <label
                htmlFor="includeResponses"
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Send my responses along with this request
              </label>
            </div>
          </div>
        </ui.SimpleDialog>
      )}
    </>
  );
}
