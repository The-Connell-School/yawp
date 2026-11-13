import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '~/utils/misc';

/**
 * The sort control inside a table header: the column label as plain text,
 * no pill or background. The sorted column shows a small arrow and darker
 * text; other sortable columns reveal a faint up/down hint on hover or focus.
 *
 * `arrow` is the arrow to draw for the sorted column ('up' | 'down'), or null
 * when this column is not the sorted one. Callers keep their own mapping from
 * sort direction to arrow.
 */
export function SortableTableHeadButton({
  label,
  arrow,
  onClick,
  disabled = false,
  ariaLabel,
  className,
}: {
  label: ReactNode;
  arrow: 'up' | 'down' | null;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  if (disabled) {
    return (
      <span className={cn('inline-flex items-center font-medium', className)}>
        {label}
      </span>
    );
  }
  const active = arrow !== null;
  const Icon = arrow === 'up' ? ArrowUp : arrow === 'down' ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'group -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-left font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        className
      )}
    >
      {label}
      <Icon
        aria-hidden
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          active
            ? 'opacity-80'
            : 'opacity-0 transition-opacity group-hover:opacity-50 group-focus-visible:opacity-50'
        )}
      />
    </button>
  );
}
