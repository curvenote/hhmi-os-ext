import { useMemo } from 'react';
import { ui } from '@curvenote/scms-core';

function storedServiceConfigurationJson(record: Record<string, unknown>): string {
  const raw = record.storedServiceConfiguration;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return JSON.stringify(raw, null, 2);
  }
  return JSON.stringify({}, null, 2);
}

function storedServiceConfigurationIsEmpty(record: Record<string, unknown>): boolean {
  const raw = record.storedServiceConfiguration;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true;
  return Object.keys(raw as Record<string, unknown>).length === 0;
}

type Props = {
  displayConfig: Record<string, unknown>;
};

export function TextIntegrityServiceConfigurationPanel({ displayConfig }: Props) {
  const storedJson = useMemo(() => storedServiceConfigurationJson(displayConfig), [displayConfig]);
  const storedEmpty = useMemo(
    () => storedServiceConfigurationIsEmpty(displayConfig),
    [displayConfig],
  );

  return (
    <ui.Accordion type="single" collapsible className="px-3 rounded-md border border-border">
      <ui.AccordionItem value="service-config" className="border-0">
        <ui.AccordionTrigger className="justify-between py-0 text-sm font-medium hover:no-underline">
          Service configuration
        </ui.AccordionTrigger>
        <ui.AccordionContent className="pb-3 space-y-3">
          {storedEmpty ? (
            <p className="text-xs text-muted-foreground">
              No service data stored yet. Use Configure after a successful connection test.
            </p>
          ) : null}
          <pre className="overflow-auto p-3 max-h-80 font-mono text-xs whitespace-pre-wrap break-words rounded-md border bg-muted border-border">
            {storedJson}
          </pre>
        </ui.AccordionContent>
      </ui.AccordionItem>
    </ui.Accordion>
  );
}
