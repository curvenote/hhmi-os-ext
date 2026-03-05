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

export const PMC_REQUEST_NEW_VERSION_BY_TEAM = 'PMC_REQUEST_NEW_VERSION_BY_TEAM';

export interface RequestNewVersionByTeamEmailProps {
  submitterName?: string;
  depositUrl: string;
  supportEmail: string;
}

export const RequestNewVersionByTeamEmail = ({
  asBaseUrl,
  branding,
  unsubscribeUrl,
  submitterName,
  depositUrl,
  supportEmail,
}: RequestNewVersionByTeamEmailProps & DefaultEmailProps) => {
  const previewText = 'The HHMI Open Science team has requested a new version of your deposit';

  return (
    <Html>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Head />
        <Body className="px-2 mx-auto my-auto font-sans bg-white">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Logo asBaseUrl={asBaseUrl} branding={branding} />
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              New version requested for your PMC deposit
            </Heading>
            <Text className="text-[14px] text-black leading-[24px]">
              Hello{submitterName ? ` ${submitterName}` : ''},
            </Text>
            <Text className="text-[14px] text-black leading-[24px]">
              A new version of your deposit has been requested by the HHMI Open Science team. Please
              upload a new version when you are ready.
            </Text>
            <Text className="text-[14px] text-black leading-[24px]">
              If you have any questions, please reach out to{' '}
              <a href={`mailto:${supportEmail}`} className="text-[#0066cc] underline">
                {supportEmail}
              </a>
              .
            </Text>
            <Section className="mt-[32px] mb-[32px] text-center">
              <Button
                className="rounded bg-[#000000] px-5 py-3 text-center font-semibold text-[12px] text-white no-underline"
                href={depositUrl}
              >
                Upload new version
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
