'use client';

import { useState } from 'react';
import { ServiceLogo, ui } from '@curvenote/scms-core';
import { Logos } from '../client.js';
import { textIntegrityServiceLogoClassName } from '../textIntegrityLogoStyles.js';

export type TextIntegrityEulaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logoUrl?: string;
  html?: string;
  url?: string;
  version: string;
  language?: string;
  busy?: boolean;
  onAccept: (params: { version: string; language: string }) => void;
};

const DIALOG_LOGO_CLASS = 'h-6 w-auto max-w-[120px] object-contai pb-[2px]';

/** Wrap plain-text EULA (sandbox) in a minimal document for sandboxed srcDoc display. */
function eulaSrcDoc(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return '';
  if (/<[a-z][\s>]/i.test(trimmed)) return trimmed;
  const escaped = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;margin:1rem;line-height:1.5;color:#1c1917;}</style></head><body><p>${escaped}</p></body></html>`;
}

export function TextIntegrityEulaDialog({
  open,
  onOpenChange,
  logoUrl,
  html,
  url,
  version,
  language = 'en-US',
  busy = false,
  onAccept,
}: TextIntegrityEulaDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const srcDoc = html?.trim() ? eulaSrcDoc(html) : undefined;

  const handleOpenChange = (next: boolean) => {
    if (busy && !next) return;
    if (!next) setConfirmed(false);
    onOpenChange(next);
  };

  return (
    <ui.SimpleDialog
      open={open}
      variant="wide"
      onOpenChange={handleOpenChange}
      showCloseButton={!busy}
      title={
        <span className="flex gap-3 items-center">
          <ServiceLogo
            logoUrl={logoUrl}
            alt="Text Integrity"
            fallback={<Logos.TextIntegrityLogo className={DIALOG_LOGO_CLASS} />}
            className={textIntegrityServiceLogoClassName(DIALOG_LOGO_CLASS)}
          />
          <span>End User License Agreement</span>
        </span>
      }
      description="You must read and accept the agreement before using text integrity."
      footer={
        <>
          <ui.StatefulButton
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </ui.StatefulButton>
          <ui.StatefulButton
            type="button"
            disabled={!confirmed}
            busy={busy}
            onClick={() => onAccept({ version, language })}
          >
            Accept
          </ui.StatefulButton>
        </>
      }
    >
      <div className="space-y-4">
        {srcDoc ? (
          <iframe
            title="End User License Agreement"
            sandbox=""
            srcDoc={srcDoc}
            className="w-full h-[min(60vh,480px)] border border-stone-200 rounded-sm bg-white"
            referrerPolicy="no-referrer"
          />
        ) : url ? (
          <p className="text-sm text-muted-foreground">
            Cached agreement text is not available yet.{' '}
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
              Open the EULA page
            </a>{' '}
            in a new tab, or try again after the cache has refreshed.
          </p>
        ) : (
          <ui.SimpleAlert
            type="warning"
            message="EULA content is not available. Try again later."
          />
        )}
        <label
          className={`flex gap-2 items-start ${busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          <ui.Checkbox
            checked={confirmed}
            onCheckedChange={(v) => {
              if (busy) return;
              setConfirmed(v === true);
            }}
            disabled={busy}
          />
          <span className="text-sm leading-snug">
            I confirm that I have read and accept the End User License Agreement
          </span>
        </label>
      </div>
    </ui.SimpleDialog>
  );
}
