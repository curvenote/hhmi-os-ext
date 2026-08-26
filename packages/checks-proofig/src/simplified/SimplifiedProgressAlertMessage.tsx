import { LoadingSpinner, cn } from '@curvenote/scms-core';

export function SimplifiedProgressAlertMessage({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={cn('flex w-full min-w-0 items-center justify-between gap-3', className)}>
      <span className="min-w-0">{text}</span>
      <LoadingSpinner className="shrink-0 text-muted-foreground" size={22} thickness={3} />
    </span>
  );
}
