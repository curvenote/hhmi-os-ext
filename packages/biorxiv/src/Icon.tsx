import { cn } from '@curvenote/scms-core';

export function BioRxivIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-sm bg-[#6b1f45] px-1.5 text-[10px] font-semibold leading-none text-white',
        className,
      )}
    >
      bioRxiv
    </span>
  );
}
