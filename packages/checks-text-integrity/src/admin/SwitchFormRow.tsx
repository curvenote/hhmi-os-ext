import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { ui } from '@curvenote/scms-core';
import { Info } from 'lucide-react';
import type { SwitchOptionDescriptor } from './settings-config.js';

export const INTENT_UPDATE_SETTING = 'text-integrity-update-setting';

function SettingHint({ description }: { description: string }) {
  return (
    <ui.SimpleTooltip
      title={description}
      asChild
      className="max-w-80 whitespace-normal break-words text-left"
    >
      <button
        type="button"
        className="inline-flex shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="More information"
      >
        <Info className="size-4" aria-hidden />
      </button>
    </ui.SimpleTooltip>
  );
}

type ActionData = { error?: { type?: string; message: string }; success?: boolean };

function submitUpdate(
  fetcher: ReturnType<typeof useFetcher<ActionData>>,
  name: string,
  value: string,
) {
  fetcher.submit({ intent: INTENT_UPDATE_SETTING, name, value }, { method: 'post' });
}

export function SwitchFormRow({ descriptor }: { descriptor: SwitchOptionDescriptor }) {
  if (descriptor.kind === 'smallMatches') {
    return <SmallMatchesFormRow descriptor={descriptor} />;
  }
  return <BooleanSwitchFormRow descriptor={descriptor} />;
}

function BooleanSwitchFormRow({
  descriptor,
}: {
  descriptor: Extract<SwitchOptionDescriptor, { kind: 'boolean' }>;
}) {
  const fetcher = useFetcher<ActionData>();
  const revalidator = useRevalidator();
  const [checked, setChecked] = useState(descriptor.defaultValue);

  useEffect(() => {
    setChecked(descriptor.defaultValue);
  }, [descriptor.defaultValue]);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (fetcher.data.error) {
      ui.toastError(fetcher.data.error.message);
      setChecked(descriptor.defaultValue);
      return;
    }
    if (fetcher.data.success) {
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, descriptor.defaultValue, revalidator]);

  const onCheckedChange = useCallback(
    (next: boolean) => {
      if (descriptor.disabled) return;
      setChecked(next);
      submitUpdate(fetcher, descriptor.name, next ? 'true' : 'false');
    },
    [fetcher, descriptor.name, descriptor.disabled],
  );

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 py-2 ${descriptor.disabled ? 'opacity-50' : ''}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-sm font-medium">{descriptor.label}</span>
        <SettingHint description={descriptor.description} />
      </div>
      <ui.Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={descriptor.disabled}
        aria-label={descriptor.label}
        className="h-[1.15rem] w-8 shrink-0 cursor-pointer data-[state=checked]:bg-primary disabled:cursor-not-allowed"
      />
    </div>
  );
}

const SMALL_MATCH_MIN = 1;
const SMALL_MATCH_MAX = 20;

function SmallMatchesFormRow({
  descriptor,
}: {
  descriptor: Extract<SwitchOptionDescriptor, { kind: 'smallMatches' }>;
}) {
  const fetcher = useFetcher<ActionData>();
  const revalidator = useRevalidator();
  const [checked, setChecked] = useState(descriptor.enabled);
  const [draft, setDraft] = useState(() => String(descriptor.wordThreshold));
  const suppressNextBlurCommit = useRef(false);

  useEffect(() => {
    setChecked(descriptor.enabled);
    setDraft(String(descriptor.wordThreshold));
  }, [descriptor.enabled, descriptor.wordThreshold]);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (fetcher.data.error) {
      ui.toastError(fetcher.data.error.message);
      setChecked(descriptor.enabled);
      setDraft(String(descriptor.wordThreshold));
      return;
    }
    if (fetcher.data.success) {
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, descriptor.enabled, descriptor.wordThreshold, revalidator]);

  const commitThreshold = useCallback(
    (rawValue: string = draft) => {
      if (descriptor.disabled || !checked) return;
      let threshold = Math.floor(Number.parseInt(rawValue, 10));
      if (Number.isNaN(threshold)) threshold = descriptor.wordThreshold;
      if (threshold === 0) {
        setChecked(false);
        submitUpdate(fetcher, descriptor.name, 'false');
        return;
      }
      threshold = Math.min(SMALL_MATCH_MAX, Math.max(SMALL_MATCH_MIN, threshold));
      setDraft(String(threshold));
      submitUpdate(fetcher, descriptor.name, String(threshold));
    },
    [checked, descriptor.disabled, descriptor.name, descriptor.wordThreshold, draft, fetcher],
  );

  const suppressThresholdBlurCommitOnce = useCallback(() => {
    suppressNextBlurCommit.current = true;
    window.setTimeout(() => {
      suppressNextBlurCommit.current = false;
    }, 0);
  }, []);

  const onCheckedChange = useCallback(
    (next: boolean) => {
      if (descriptor.disabled) return;
      setChecked(next);
      submitUpdate(fetcher, descriptor.name, next ? 'true' : 'false');
    },
    [descriptor.disabled, descriptor.name, fetcher],
  );

  return (
    <div
      className={`flex flex-col gap-2 py-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between ${descriptor.disabled ? 'opacity-50' : ''}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-sm font-medium">{descriptor.label}</span>
        <SettingHint description={descriptor.description} />
      </div>
      <div className="flex w-full max-w-xs flex-col items-stretch gap-2 sm:w-auto sm:items-end">
        <div className="flex items-center justify-end gap-3">
          <ui.Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            onPointerDownCapture={suppressThresholdBlurCommitOnce}
            disabled={descriptor.disabled}
            aria-label={descriptor.label}
            className="h-[1.15rem] w-8 shrink-0 cursor-pointer data-[state=checked]:bg-primary disabled:cursor-not-allowed"
          />
          <ui.Input
            type="number"
            min={0}
            max={SMALL_MATCH_MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (suppressNextBlurCommit.current) {
                suppressNextBlurCommit.current = false;
                return;
              }
              commitThreshold();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitThreshold();
            }}
            disabled={descriptor.disabled || !checked}
            className="h-9 w-full font-mono text-sm sm:w-24"
            aria-label="Minimum word count for a match to count toward similarity"
          />
        </div>
        <p
          className={`text-xs sm:text-right ${
            checked && !descriptor.disabled ? 'text-muted-foreground' : 'text-muted-foreground/70'
          }`}
        >
          Matches shorter than this many words are ignored. Use 0 to turn this setting off.
        </p>
      </div>
    </div>
  );
}
