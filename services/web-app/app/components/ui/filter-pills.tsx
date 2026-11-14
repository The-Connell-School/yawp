import { cn } from '~/utils/misc';

export type FilterPillOption<Value extends string> = {
  value: Value;
  label: string;
  count?: number;
  /** Tailwind background class for a small colored dot before the label. */
  dotClassName?: string;
};

/**
 * The segmented "All / … " pill row above work tables (Documents status,
 * My Assignments type). One option is active at a time; each shows a count.
 */
export function FilterPills<Value extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  testId,
}: {
  options: FilterPillOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  ariaLabel: string;
  testId?: string;
}) {
  const pillClass = (isActive: boolean) =>
    cn(
      'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm/5 font-medium sm:text-sm/5',
      isActive
        ? 'bg-popover text-foreground shadow-sm ring-1 ring-black/10'
        : 'text-foreground/80 hover:bg-popover/70 hover:text-foreground'
    );

  const countClass = (isActive: boolean) =>
    cn('tabular-nums', isActive ? 'text-muted-foreground' : 'text-foreground/60');

  return (
    // The rounded bar is the outer frame and the pills scroll inside it, so
    // both ends stay fully rounded even when the row overflows. The padding
    // lives on the scrolling row (not the frame) so the active pill's ring and
    // shadow have room inside the scroll clip instead of being cut off.
    <div
      className="inline-flex max-w-full overflow-hidden rounded-full border border-border bg-secondary shadow-xs"
      data-testid={testId}
      role="tablist"
      aria-label={ariaLabel}
    >
      <div className="flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto rounded-full p-1 no-scrollbar">
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(option.value)}
              className={pillClass(isActive)}
            >
              {option.dotClassName ? (
                <span
                  className={cn('size-2 shrink-0 rounded-full', option.dotClassName)}
                  aria-hidden
                />
              ) : null}
              {option.label}
              {typeof option.count === 'number' ? (
                <span className={countClass(isActive)}>{option.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
