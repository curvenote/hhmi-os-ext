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

export const PMC_NIHMS_FILES_REQUESTED = 'PMC_NIHMS_FILES_REQUESTED';

export interface NihmsFilesRequestedEmailProps {
  submitterName?: string;
  manuscriptId: string;
  message: string;
  depositUrl: string;
}

export const NihmsFilesRequestedEmail = ({
  asBaseUrl,
  branding,
  unsubscribeUrl,
  submitterName,
  manuscriptId,
  message,
  depositUrl,
}: NihmsFilesRequestedEmailProps & DefaultEmailProps) => {
  const previewText = `NIHMS requires additional files for manuscript ${manuscriptId}`;

  return (
    <Html>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Head />
        <Body className="px-2 mx-auto my-auto font-sans bg-white">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Logo asBaseUrl={asBaseUrl} branding={branding} />
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              NIHMS has requested additional files for your manuscript
            </Heading>
            <Text className="text-[14px] text-black leading-[24px]">
              Hello{submitterName ? ` ${submitterName}` : ''},
            </Text>
            <Text className="text-[14px] text-black leading-[24px]">
              NIHMS has sent a message regarding your manuscript <strong>{manuscriptId}</strong>:
            </Text>
            <Section className="my-[20px] pl-[16px] border-l-4 border-[#cccccc] bg-[#f9f9f9] py-[12px] pr-[16px]">
              <Text className="text-[14px] text-[#333333] leading-[22px] whitespace-pre-wrap my-0">
                {message}
              </Text>
            </Section>
            <Text className="text-[14px] text-black leading-[24px]">
              Please review the request and take the necessary action to update your manuscript:
            </Text>
            <Section className="mt-[32px] mb-[32px] text-center">
              <Button
                className="rounded bg-[#000000] px-5 py-3 text-center font-semibold text-[12px] text-white no-underline"
                href={depositUrl}
              >
                Review Request
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
