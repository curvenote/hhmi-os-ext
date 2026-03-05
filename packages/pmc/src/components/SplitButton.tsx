import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ui, cn } from '@curvenote/scms-core';

export interface SplitButtonOption {
  label: string;
  value: string;
}

export interface SplitButtonProps {
  /** Label for the primary (default) action */
  primaryLabel: string;
  /** Value passed to onPrimaryAction (e.g. transition name) */
  primaryValue: string;
  /** Called when the primary action is triggered */
  onPrimaryAction: (value: string) => void;
  /** Additional actions shown in the dropdown (excluding the primary) */
  otherActions: SplitButtonOption[];
  /** Called when a dropdown option is selected; close the menu after */
  onOptionSelect: (value: string) => void;
  disabled?: boolean;
  busy?: boolean;
  /** Optional size for the button and dropdown menu (default: default) */
  size?: 'xs' | 'sm' | 'default';
  /** Optional variant (default: default) */
  variant?: 'default' | 'outline';
  /** Optional class for the root container */
  className?: string;
}

const menuSizeClasses = {
  content: {
    xs: 'min-w-[8rem] p-0.5',
    sm: 'min-w-[9rem] p-1',
    default: 'min-w-[10rem] p-1',
  },
  item: {
    xs: 'px-2 py-1.5 text-[11px]',
    sm: 'px-3 py-2 text-xs',
    default: 'px-4 py-2 text-sm',
  },
  chevron: {
    xs: 'h-4 w-4',
    sm: 'h-5 w-5',
    default: 'h-5 w-5',
  },
} as const;

/**
 * A split button: primary action as the main button, with a dropdown for
 * additional actions. Uses Radix UI dropdown for keyboard accessibility.
 * When otherActions is empty, renders a single primary button (no split).
 */
export function SplitButton({
  primaryLabel,
  primaryValue,
  onPrimaryAction,
  otherActions,
  onOptionSelect,
  disabled = false,
  busy = false,
  size = 'default',
  variant = 'default',
  className,
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);

  const handleOptionClick = (value: string) => {
    onOptionSelect(value);
    setOpen(false);
  };

  const hasDropdown = otherActions.length > 0;
  const splitDividerClass =
    variant === 'outline'
      ? 'border-r border-stone-200 dark:border-stone-700'
      : 'border-r border-white/30';
  const openClass = variant === 'outline' ? 'bg-stone-100 dark:bg-stone-800' : 'bg-primary/60';

  if (!hasDropdown) {
    return (
      <ui.StatefulButton
        variant={variant}
        size={size}
        busy={busy}
        disabled={disabled}
        overlayBusy
        onClick={() => onPrimaryAction(primaryValue)}
        className={cn('w-full', className)}
      >
        {primaryLabel}
      </ui.StatefulButton>
    );
  }

  return (
    <div className={cn('flex w-full rounded-md shadow-xs', className)} role="group">
      {/* Primary action – left part of split */}
      <ui.StatefulButton
        variant={variant}
        size={size}
        busy={busy}
        disabled={disabled}
        overlayBusy
        onClick={() => onPrimaryAction(primaryValue)}
        className={cn('flex-1 min-w-0 rounded-r-none', splitDividerClass)}
      >
        {primaryLabel}
      </ui.StatefulButton>

      {/* Dropdown trigger – right part with chevron */}
      <ui.Menu open={open} onOpenChange={setOpen}>
        <ui.MenuTrigger asChild>
          <ui.Button
            type="button"
            variant={variant}
            size={size}
            disabled={disabled || busy}
            className={cn(
              'px-2 rounded-l-none border-l-0 transition-colors',
              variant === 'default' && 'border-white/30',
              open && openClass,
            )}
            aria-label="More actions"
          >
            {open ? (
              <ChevronUp className={menuSizeClasses.chevron[size]} />
            ) : (
              <ChevronDown className={menuSizeClasses.chevron[size]} />
            )}
          </ui.Button>
        </ui.MenuTrigger>
        <ui.MenuContent className={menuSizeClasses.content[size]} align="end" sideOffset={4}>
          {otherActions.map((action) => (
            <ui.MenuItem
              key={action.value}
              className={menuSizeClasses.item[size]}
              onSelect={(e) => {
                e.preventDefault();
                handleOptionClick(action.value);
              }}
            >
              {action.label}
            </ui.MenuItem>
          ))}
        </ui.MenuContent>
      </ui.Menu>
    </div>
  );
}
