import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLayoutEffect } from 'react';
import { cn } from '~/utils/misc';
import { getFilterPillScrollBehavior } from './filter-pills-overflow';
import { useFilterPillsOverflow } from './use-filter-pills-overflow';

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
  const {
    trackRef,
    overflow,
    measureOverflow,
    scrollTabs,
    revealTab,
    prefersReducedMotion,
  } = useFilterPillsOverflow(options.length);

  const pillClass = (isActive: boolean) =>
    cn(
      'inline-flex shrink-0 snap-start items-center gap-2 rounded-full px-3 py-1.5 text-sm/5 font-medium sm:text-sm/5',
      isActive
        ? 'bg-popover text-foreground shadow-sm ring-1 ring-black/10'
        : 'text-foreground/80 hover:bg-popover/70 hover:text-foreground'
    );

  const countClass = (isActive: boolean) =>
    cn('tabular-nums', isActive ? 'text-muted-foreground' : 'text-foreground/60');

  const scrollBehavior = getFilterPillScrollBehavior(prefersReducedMotion);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track
      .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: scrollBehavior,
      });
    measureOverflow();
  }, [measureOverflow, scrollBehavior, trackRef, value]);

  return (
    <div
      className="relative inline-flex min-w-0 max-w-full"
      data-testid={testId ? `${testId}-wrapper` : undefined}
    >
      <div
        className="relative inline-flex min-w-0 max-w-full overflow-hidden rounded-full border border-border bg-secondary shadow-xs"
        data-testid={testId}
        data-has-overflow={overflow.hasOverflow ? 'true' : 'false'}
        data-can-scroll-left={overflow.canScrollLeft ? 'true' : 'false'}
        data-can-scroll-right={overflow.canScrollRight ? 'true' : 'false'}
        role="tablist"
        aria-label={ariaLabel}
      >
        {overflow.canScrollLeft ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-10 bg-gradient-to-r from-secondary via-secondary/80 to-transparent"
              data-testid={testId ? `${testId}-fade-left` : undefined}
            />
            <button
              type="button"
              aria-label="Scroll tabs left"
              data-testid={testId ? `${testId}-scroll-left` : undefined}
              onClick={() => scrollTabs('left')}
              className="absolute left-0.5 top-1/2 z-[2] inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-popover/95 text-foreground shadow-xs hover:bg-popover"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
          </>
        ) : null}
        {overflow.canScrollRight ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-10 bg-gradient-to-l from-secondary via-secondary/80 to-transparent"
              data-testid={testId ? `${testId}-fade-right` : undefined}
            />
            <button
              type="button"
              aria-label="Scroll tabs right"
              data-testid={testId ? `${testId}-scroll-right` : undefined}
              onClick={() => scrollTabs('right')}
              className="absolute right-0.5 top-1/2 z-[2] inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-popover/95 text-foreground shadow-xs hover:bg-popover"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </>
        ) : null}
        <div
          ref={trackRef}
          onScroll={measureOverflow}
          className={cn(
            'flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto rounded-full p-1 no-scrollbar',
            overflow.canScrollLeft && 'pl-8',
            overflow.canScrollRight && 'pr-8',
            'scroll-smooth snap-x snap-proximity'
          )}
        >
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={(event) => {
                  onChange(option.value);
                  revealTab(event.currentTarget);
                }}
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
    </div>
  );
}