import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import { Logo, UnsubscribeButton } from '@curvenote/scms-core';
import type { DefaultEmailProps } from '@curvenote/scms-core';

export const PMC_PENDING_DEPOSIT_NOTIFICATION = 'PMC_PENDING_DEPOSIT_NOTIFICATION';

export interface PendingDepositNotificationEmailProps {
  title: string;
  journalName?: string;
  doiUrl?: string;
  workVersionId: string;
  adminSubmissionUrl: string;
}

export const PendingDepositNotificationEmail = ({
  asBaseUrl,
  branding,
  unsubscribeUrl,
  title,
  journalName,
  doiUrl,
  workVersionId,
  adminSubmissionUrl,
}: PendingDepositNotificationEmailProps & DefaultEmailProps) => {
  const previewText = `New deposit confirmed: ${title}`;

  return (
    <Html>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Head />
        <Body className="px-2 mx-auto my-auto font-sans bg-white">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Logo asBaseUrl={asBaseUrl} branding={branding} />
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              PMC: New deposit submitted
            </Heading>
            <Text className="text-[14px] text-black leading-[24px]">
              A new PMC deposit has been submitted and will be transferred to the PMC shortly.
            </Text>
            <Text className="text-[14px] text-black leading-[24px]">
              <strong>Title:</strong> {title}
            </Text>
            <Text className="text-[14px] text-black leading-[24px]">
              <strong>Journal:</strong> {journalName ?? '—'}
            </Text>
            <Text className="text-[14px] text-black leading-[24px]">
              <strong>DOI:</strong> {doiUrl ?? '—'}
            </Text>
            <Text className="text-[14px] text-black leading-[24px]">
              <strong>Work version ID:</strong> {workVersionId}
            </Text>
            <Text className="text-[14px] text-black leading-[24px]">
              Click the button below to view the submission in the admin:
            </Text>
            <Section className="mt-[32px] mb-[32px] text-center">
              <Button
                className="rounded bg-[#000000] px-5 py-3 text-center font-semibold text-[12px] text-white no-underline"
                href={adminSubmissionUrl}
              >
                View submission in admin
              </Button>
            </Section>
            <Hr className="mx-0 my-[26px] w-full border border-[#eaeaea] border-solid" />
            <Section className="mt-[20px] mb-[20px] text-center">
              <UnsubscribeButton
                asBaseUrl={asBaseUrl}
                unsubscribeUrl={unsubscribeUrl}
                className="text-[#666666]"
              />
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
