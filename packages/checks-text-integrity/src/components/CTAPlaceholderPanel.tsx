import type { ReactNode } from 'react';

type CTAPlaceholderPanelProps = {
  logo?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function CTAPlaceholderPanel({
  logo,
  title,
  description,
  action,
  className,
}: CTAPlaceholderPanelProps) {
  const baseClassName = 'flex flex-col justify-center items-center py-8 text-center';
  const combinedClassName = className ? `${baseClassName} ${className}` : baseClassName;

  return (
    <div className={combinedClassName}>
      {logo}
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      {description ? (
        <p className="mb-4 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
