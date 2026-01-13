import { redirect, data } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { withAppContext, sanitizeUserInput } from '@curvenote/scms-server';
import {
  MainWrapper,
  PageFrame,
  getBrandingFromMetaMatches,
  joinPageTitle,
  KnownResendEvents,
} from '@curvenote/scms-core';
import { ComplianceWizard } from '../components/ComplianceWizard.js';
import type { ComplianceWizardConfig, ComplianceWizardState } from '../common/complianceTypes.js';
import { complianceWizardConfig } from '../common/compliance-wizard.config.js';
import { composeHelpRequestEmailBody } from '../email/compose-help-request-email.js';

interface LoaderData {
  config: ComplianceWizardConfig;
}

export const meta: MetaFunction<LoaderData> = ({ matches }) => {
  const branding = getBrandingFromMetaMatches(matches);
  return [{ title: joinPageTitle('Get Help with Compliance', branding.title) }];
};

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData | Response> {
  const ctx = await withAppContext(args);

  // Check if PMC extension is enabled in config
  if (!ctx.$config.app.extensions?.pmc) {
    return redirect('/app/works');
  }

  // Use the imported TypeScript config
  const config = complianceWizardConfig;

  return { config };
}

export const action = async (args: ActionFunctionArgs) => {
  const ctx = await withAppContext(args);

  const formData = await args.request.formData();
  const rawAdditionalInfo = formData.get('additionalInfo') as string;
  const includeResponses = formData.get('includeResponses') === 'true';
  const wizardStateJson = formData.get('wizardState') as string;

  // Sanitize additional info input
  const additionalInfo = rawAdditionalInfo ? sanitizeUserInput(rawAdditionalInfo, 2000) : '';

  const supportEmail = ctx.$config.app?.branding?.supportEmail;
  if (!supportEmail) {
    console.error('Support email not configured');
    return data({ success: false, error: 'Support email not configured' }, { status: 500 });
  }

  const userName = ctx.user.display_name || 'Unknown User';
  const userEmail = ctx.user.email || 'No email provided';

  let wizardState: ComplianceWizardState | null = null;

  if (includeResponses && wizardStateJson) {
    try {
      wizardState = JSON.parse(wizardStateJson) as ComplianceWizardState;
    } catch (error) {
      console.error('Failed to parse wizard state:', error);
    }
  }

  try {
    await ctx.sendEmail({
      eventType: KnownResendEvents.GENERIC_NOTIFICATION,
      to: supportEmail,
      subject: 'Compliance Questionnaire - Help Requested',
      templateProps: {
        previewText: `Help requested from ${userName}`,
        children: composeHelpRequestEmailBody({
          userName,
          userEmail,
          additionalInfo: additionalInfo || undefined,
          wizardState,
          config: complianceWizardConfig,
        }),
      },
      ignoreUnsubscribe: true,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send help request email:', error);
    return data({ success: false, error: 'Failed to send email' }, { status: 500 });
  }
};

export default function ComplianceWizardRoute({ loaderData }: { loaderData: LoaderData }) {
  const { config } = loaderData;

  const breadcrumbs = [
    { label: 'Home', href: '/app/dashboard' },
    { label: 'Open Access Policy Compliance Questionnaire', isCurrentPage: true },
  ];

  return (
    <MainWrapper>
      <PageFrame
        className="pr-0"
        title="Get Help with Open Access Policy Compliance"
        description={
          <div className="max-w-4xl">
            <p className="leading-relaxed text-muted-foreground">
              Answer a few questions to receive guidance on next steps toward open access policy
              requirements. While HHMI does not seek or receive funds from any government agency,
              for convenience, certain information is provided through these tools regarding the
              2024 NIH Public Access Policy public availability requirement (as in effect on
              September 28, 2025). This information is based on our understanding of this NIH
              requirement, as it applies to HHMI host institutions. However, if you are located at
              an HHMI host institution, you should work with your host institution to manage and
              comply with this and all other NIH policies or requirements applicable to them.
            </p>
            <p className="leading-relaxed text-muted-foreground">
              Please remember that, if you are located at an HHMI host institution, you should
              always verify all policy requirements with your host institution and other funders. As
              always, you are responsible for meeting the requirements of the policies that apply to
              your research and checking with your collaborators to understand their requirements.
            </p>
          </div>
        }
        breadcrumbs={breadcrumbs}
      >
        <ComplianceWizard config={config as ComplianceWizardConfig} />
      </PageFrame>
    </MainWrapper>
  );
}
