'use client';

import type { UploadCheckOptionProps } from '@curvenote/scms-core';
import { UploadCheckCardContent } from '@curvenote/scms-core';
import { Logos } from '../client.js';

const DEFAULT_INFO_LINE = '1 file only, DOCX or PDF, 50 MB maximum size';

export function ProofigUploadCheckOption({
  enabled,
  disabled,
  invalid,
  warning,
  warningMessage,
  setEnabled,
  toggleBusy = false,
}: UploadCheckOptionProps) {
  return (
    <UploadCheckCardContent
      logo={<Logos.LogoThemed className="h-[22px] w-auto max-w-[79px]" alt="Proofig" />}
      title="Check Image Integrity"
      description="Submit your document to Proofig for analysis and integrity checking."
      infoLine={DEFAULT_INFO_LINE}
      warning={warning}
      warningMessage={warningMessage}
      enabled={enabled}
      disabled={disabled}
      invalid={invalid}
      busy={toggleBusy}
      spinnerWhenBusy
      onRequestEnable={() => {
        void setEnabled(true);
      }}
    />
  );
}
