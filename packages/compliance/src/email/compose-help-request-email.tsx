import { Heading, Text, Section } from '@react-email/components';
import React from 'react';
import type { ComplianceWizardState, ComplianceWizardConfig } from '../common/complianceTypes.js';

/**
 * Formats wizard responses in human-readable format
 */
function formatWizardResponses(
  state: ComplianceWizardState,
  config: ComplianceWizardConfig,
): string {
  const lines: string[] = [];

  Object.entries(state).forEach(([questionId, value]) => {
    if (value === null) return;

    const question = config.questions[questionId];
    if (!question) return;

    lines.push(`${question.title}`);

    // Find the selected option label
    const option = question.options.find((opt) => opt.value === value);
    if (option) {
      const label = Array.isArray(option.label) ? option.label.join('') : option.label;
      lines.push(`  - ${label}`);
    } else {
      lines.push(`  - ${value}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Composes the email body content for a compliance wizard help request
 */
export function composeHelpRequestEmailBody(params: {
  userName: string;
  userEmail: string;
  additionalInfo?: string;
  wizardState?: ComplianceWizardState | null;
  config: ComplianceWizardConfig;
}): React.ReactNode {
  const { userName, userEmail, additionalInfo, wizardState, config } = params;

  const formattedResponses = wizardState ? formatWizardResponses(wizardState, config) : '';

  return (
    <>
      <Heading className="mx-0 my-[30px] p-0 text-[24px] font-normal text-black">
        Compliance Questionnaire - Help Requested
      </Heading>
      <Text className="text-[14px] text-black leading-[24px]">
        A user has requested help with the Compliance Questionnaire:
      </Text>
      <Section className="my-[16px] p-[16px] bg-[#f4f4f4] rounded">
        <Text className="text-[14px] text-black leading-[24px] my-0">
          <strong>Name:</strong> {userName}
        </Text>
        <Text className="text-[14px] text-black leading-[24px] my-0">
          <strong>Email:</strong> {userEmail}
        </Text>
      </Section>
      {additionalInfo && (
        <>
          <Text className="text-[14px] text-black leading-[24px]">
            <strong>Additional Information:</strong>
          </Text>
          <Section className="my-[16px] p-[16px] bg-[#f4f4f4] rounded">
            <Text className="text-[14px] text-black leading-[24px] whitespace-pre-wrap">
              {additionalInfo}
            </Text>
          </Section>
        </>
      )}
      {formattedResponses && (
        <>
          <Text className="text-[14px] text-black leading-[24px]">
            <strong>Questionnaire Responses:</strong>
          </Text>
          <Section className="my-[16px] p-[16px] bg-[#f4f4f4] rounded">
            <Text className="text-[14px] text-black leading-[24px] whitespace-pre-wrap font-mono">
              {formattedResponses}
            </Text>
          </Section>
        </>
      )}
    </>
  );
}
