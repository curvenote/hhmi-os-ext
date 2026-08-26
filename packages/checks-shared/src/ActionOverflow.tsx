import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { ui } from '@curvenote/scms-core';

export type ActionOverflowMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

/**
 * Shows one primary control/message in full, and parks additional actions in a
 * vertical-ellipsis (kebab) menu on the right when needed.
 */
export function ActionOverflow({
  primary,
  menuItems,
  menuLabel = 'More actions',
}: {
  primary: ReactNode;
  menuItems?: ActionOverflowMenuItem[];
  menuLabel?: string;
}) {
  const items = menuItems?.filter(Boolean) ?? [];
  const showMenu = items.length > 0;

  return (
    <div className="flex items-center gap-1 min-w-0">
      <div className="min-w-0">{primary}</div>
      {showMenu ? (
        <ui.Menu>
          <ui.MenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
              aria-label={menuLabel}
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </button>
          </ui.MenuTrigger>
          <ui.MenuContent align="end" className="min-w-[11rem]">
            {items.map((item) => (
              <ui.MenuItem
                key={item.id}
                disabled={item.disabled}
                onSelect={(event) => {
                  if (item.disabled) {
                    event.preventDefault();
                    return;
                  }
                  item.onSelect();
                }}
              >
                {item.label}
              </ui.MenuItem>
            ))}
          </ui.MenuContent>
        </ui.Menu>
      ) : null}
    </div>
  );
}
