import type { ReactNode } from 'react';
import { cn } from '@curvenote/scms-core';

export function DesignSection({
  name,
  description,
  children,
  wide,
}: {
  name: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className="space-y-3">
      <header className="space-y-1">
        <h3 className="font-mono text-base font-semibold text-gray-900 dark:text-white">{name}</h3>
        {description ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
        ) : null}
      </header>
      <div
        className={
          wide
            ? 'rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900'
            : 'max-w-2xl rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900'
        }
      >
        {children}
      </div>
    </section>
  );
}

export function WorkListSummaryChip({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex h-7 max-w-full items-center overflow-hidden rounded-sm border border-gray-200 bg-white px-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
      <span
        className={cn('inline-flex min-w-0 items-center', compact ? 'h-4 gap-1' : 'h-5 gap-1.5')}
      >
        {children}
      </span>
    </span>
  );
}
