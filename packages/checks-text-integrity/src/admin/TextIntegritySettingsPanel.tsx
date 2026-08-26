import type { ReactNode } from 'react';
import { deriveSettingsConfig } from './settings-config.js';
import { SwitchFormRow } from './SwitchFormRow.js';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1 rounded-lg border border-border bg-card p-4 shadow-xs">
      <h3 className="border-b border-border pb-2 text-sm font-semibold">{title}</h3>
      <div className="pt-1">{children}</div>
    </section>
  );
}

export function TextIntegritySettingsPanel({
  storedServiceConfiguration,
}: {
  storedServiceConfiguration: unknown;
}) {
  const ssc =
    storedServiceConfiguration != null &&
    typeof storedServiceConfiguration === 'object' &&
    !Array.isArray(storedServiceConfiguration)
      ? (storedServiceConfiguration as Record<string, unknown>)
      : undefined;

  const config = deriveSettingsConfig(ssc);

  if (config == null) {
    return (
      <div
        className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-6 text-sm text-muted-foreground"
        role="status"
      >
        <p className="font-medium text-foreground">No configuration options available</p>
        <p className="mt-2">
          Either no features are enabled on your account or you need to{' '}
          <a
            href="#text-integrity-service-actions"
            className="font-medium text-primary underline underline-offset-4 hover:no-underline"
          >
            configure
          </a>{' '}
          using the form above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Search repositories">
        <div className="divide-y divide-border">
          {config.searchRepositories.map((d) => (
            <SwitchFormRow key={d.name} descriptor={d} />
          ))}
        </div>
      </Section>

      <Section title="View settings">
        <div className="divide-y divide-border">
          {config.viewSettings.map((d) => (
            <SwitchFormRow key={d.name} descriptor={d} />
          ))}
        </div>
      </Section>
    </div>
  );
}
