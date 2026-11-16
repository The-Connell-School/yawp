import { cn } from '~/utils/misc';
import { HorizontalScroll, useHorizontalScrollReveal } from './horizontal-scroll';

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
 *
 * Scroll arrows sit beside the track, never over a chip. They hide at the
 * ends so the first chip is fully visible when the row is at the start.
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
    <div
      className="relative inline-flex min-w-0 max-w-full"
      data-testid={testId ? `${testId}-wrapper` : undefined}
    >
      <HorizontalScroll
        testId={testId}
        role="tablist"
        ariaLabel={ariaLabel}
        itemCount={options.length}
        revealSelector='[role="tab"][aria-selected="true"]'
        revealKey={value}
        trackClassName="gap-0.5 p-1"
        className="overflow-hidden rounded-full border border-border bg-secondary shadow-xs"
      >
        {options.map((option) => (
          <FilterPillButton
            key={option.value}
            option={option}
            isActive={option.value === value}
            pillClassName={pillClass(option.value === value)}
            countClassName={countClass(option.value === value)}
            onChange={onChange}
          />
        ))}
      </HorizontalScroll>
    </div>
  );
}

function FilterPillButton<Value extends string>({
  option,
  isActive,
  pillClassName,
  countClassName,
  onChange,
}: {
  option: FilterPillOption<Value>;
  isActive: boolean;
  pillClassName: string;
  countClassName: string;
  onChange: (value: Value) => void;
}) {
  const reveal = useHorizontalScrollReveal();

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={(event) => {
        onChange(option.value);
        reveal(event.currentTarget);
      }}
      className={pillClassName}
    >
      {option.dotClassName ? (
        <span
          className={cn('size-2 shrink-0 rounded-full', option.dotClassName)}
          aria-hidden
        />
      ) : null}
      {option.label}
      {typeof option.count === 'number' ? (
        <span className={countClassName}>{option.count}</span>
      ) : null}
    </button>
  );
}
