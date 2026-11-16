import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '~/utils/misc';
import { revealFilterPill } from './filter-pills-overflow';
import { useFilterPillsOverflow } from './use-filter-pills-overflow';

const HorizontalScrollRevealContext = createContext<(element: HTMLElement) => void>(
  () => {}
);

export function useHorizontalScrollReveal() {
  return useContext(HorizontalScrollRevealContext);
}

/**
 * Horizontal scroller whose arrows sit beside the track.
 * The left arrow hides at the start and the right arrow hides at the end,
 * so controls never cover the content.
 */
export function HorizontalScroll({
  children,
  testId,
  role,
  ariaLabel,
  className,
  trackClassName,
  itemCount,
  revealSelector,
  revealKey,
  fadeFromClassName = 'from-secondary',
  ...rest
}: {
  children: ReactNode;
  testId?: string;
  role?: string;
  ariaLabel?: string;
  className?: string;
  trackClassName?: string;
  itemCount: number;
  revealSelector?: string;
  revealKey?: string;
  fadeFromClassName?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'className'>) {
  const { trackRef, overflow, measureOverflow, scrollTabs, revealTab } =
    useFilterPillsOverflow(itemCount);
  const revealing = useRef(false);
  const userScrolled = useRef(false);
  const lastRevealKey = useRef(revealKey);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (lastRevealKey.current !== revealKey) {
      userScrolled.current = false;
      lastRevealKey.current = revealKey;
    }
    if (userScrolled.current) return;
    if (revealSelector) {
      const selected = track.querySelector<HTMLElement>(revealSelector);
      if (selected) {
        revealing.current = true;
        revealFilterPill(track, selected, 'auto', 'start');
        revealing.current = false;
      }
    }
    measureOverflow();
  }, [
    measureOverflow,
    overflow.canScrollLeft,
    overflow.canScrollRight,
    revealKey,
    revealSelector,
    trackRef,
  ]);

  const onTrackScroll = () => {
    if (!revealing.current) userScrolled.current = true;
    measureOverflow();
  };

  return (
    <HorizontalScrollRevealContext.Provider value={revealTab}>
      <div
        {...rest}
        role={role}
        aria-label={ariaLabel}
        data-testid={testId}
        data-has-overflow={overflow.hasOverflow ? 'true' : 'false'}
        data-can-scroll-left={overflow.canScrollLeft ? 'true' : 'false'}
        data-can-scroll-right={overflow.canScrollRight ? 'true' : 'false'}
        className={cn(
          'inline-flex w-max min-w-0 max-w-full items-center',
          className
        )}
      >
        {overflow.canScrollLeft ? (
          <ScrollAffordance
            direction="left"
            testId={testId}
            fadeFromClassName={fadeFromClassName}
            onClick={() => scrollTabs('left')}
          />
        ) : null}
        <div
          ref={trackRef}
          onScroll={onTrackScroll}
          className={cn(
            'flex min-w-0 flex-nowrap items-center overflow-x-auto no-scrollbar',
            trackClassName
          )}
        >
          {children}
        </div>
        {overflow.canScrollRight ? (
          <ScrollAffordance
            direction="right"
            testId={testId}
            fadeFromClassName={fadeFromClassName}
            onClick={() => scrollTabs('right')}
          />
        ) : null}
      </div>
    </HorizontalScrollRevealContext.Provider>
  );
}

function ScrollAffordance({
  direction,
  testId,
  fadeFromClassName,
  onClick,
}: {
  direction: 'left' | 'right';
  testId?: string;
  fadeFromClassName: string;
  onClick: () => void;
}) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  const fade = (
    <div
      aria-hidden
      data-testid={testId ? `${testId}-fade-${direction}` : undefined}
      className={cn(
        'pointer-events-none h-6 w-2 shrink-0 to-transparent',
        fadeFromClassName,
        direction === 'left' ? 'bg-gradient-to-r' : 'bg-gradient-to-l'
      )}
    />
  );
  const button = (
    <button
      type="button"
      aria-label={direction === 'left' ? 'Scroll tabs left' : 'Scroll tabs right'}
      data-testid={testId ? `${testId}-scroll-${direction}` : undefined}
      onClick={onClick}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-popover text-foreground shadow-xs hover:bg-popover"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );

  return (
    <div
      className={cn(
        'flex shrink-0 items-center',
        direction === 'left' ? 'pl-1' : 'pr-1'
      )}
    >
      {direction === 'left' ? (
        <>
          {button}
          {fade}
        </>
      ) : (
        <>
          {fade}
          {button}
        </>
      )}
    </div>
  );
}
