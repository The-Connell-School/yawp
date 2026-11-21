/**
 * Options side by side (Kevin's notes on the latest run): two or three class
 * starters, exit tickets or framing cards from one reply sit in one row the
 * teacher pages through with arrows, instead of a tall stack of near-copies.
 * Every card stays on the page with its own buttons; the row only scrolls.
 * One card is mostly in view with a peek of the next (Kevin, Nov 21), so each
 * card is wide enough for its buttons to read in full.
 */
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '~/utils/misc';

/** Where a card's left edge sits in the row's scroll coordinates. */
function leftOf(row: HTMLElement, card: HTMLElement) {
  return card.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
}

const ARROW_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-full border bg-background text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40';

export function OptionRow({
  label,
  children,
  layout = 'carousel',
}: {
  label: string;
  children: ReactNode;
  /**
   * Carousel (the planner chat, Kevin Nov 21): one option mostly in view with
   * a peek of the next, paged with arrows, a swipe or a trackpad. Grid puts
   * each option in its own column (Brian's earlier layout); kept for callers
   * that want it, but three columns are too narrow for a card's buttons at
   * ordinary desktop widths.
   */
  layout?: 'carousel' | 'grid';
}) {
  const items = Children.toArray(children);
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  // Which option is showing: the one whose left edge is nearest the row's,
  // or the last one once the row cannot scroll any further.
  const onScroll = useCallback(() => {
    const row = track.current;
    if (!row) return;
    const cards = Array.from(row.children) as HTMLElement[];
    if (!cards.length) return;
    if (row.scrollLeft > 0 && row.scrollLeft >= row.scrollWidth - row.clientWidth - 2) {
      setAt(cards.length - 1);
      return;
    }
    let nearest = 0;
    let best = Infinity;
    cards.forEach((card, index) => {
      const gap = Math.abs(leftOf(row, card) - row.scrollLeft);
      if (gap < best) {
        best = gap;
        nearest = index;
      }
    });
    setAt(nearest);
  }, []);

  useEffect(onScroll, [onScroll]);

  const go = (index: number) => {
    const row = track.current;
    const card = row?.children[index] as HTMLElement | undefined;
    if (!row || !card) return;
    row.scrollTo({ left: leftOf(row, card), behavior: 'smooth' });
    setAt(index);
  };

  if (layout === 'grid') {
    return (
      <div data-testid="option-row" data-layout="grid" className="mt-3">
        <p className="sr-only">
          {label} · {items.length} options
        </p>
        <div className="lp-option-grid">
          {items.map((item, index) => (
            <div
              key={index}
              data-testid="option-row-item"
              aria-label={`Option ${index + 1} of ${items.length}`}
              className="[&>*]:mt-0"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const single = items.length === 1;
  return (
    <div
      data-testid="option-row"
      data-layout="carousel"
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      className="mt-3"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} ·{' '}
          <span data-testid="option-row-position" aria-live="polite" className="whitespace-nowrap">
            {at + 1} of {items.length}
          </span>
        </p>
        {single ? null : (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="Previous option"
              data-testid="option-prev"
              disabled={at === 0}
              onClick={() => go(at - 1)}
              className={ARROW_CLASS}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next option"
              data-testid="option-next"
              disabled={at >= items.length - 1}
              onClick={() => go(at + 1)}
              className={ARROW_CLASS}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        )}
      </div>
      <div
        ref={track}
        data-testid="option-row-track"
        onScroll={onScroll}
        className="flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:thin]"
      >
        {items.map((item, index) => (
          <div
            key={index}
            data-testid="option-row-item"
            role="group"
            aria-roledescription="slide"
            aria-label={`Option ${index + 1} of ${items.length}`}
            // Mostly one card, the next peeking in from the right so it is
            // plain there is more (Kevin, Nov 21).
            className={cn(
              'min-w-0 shrink-0 snap-start [&>*]:mt-0',
              single ? 'w-full' : 'w-[85%] sm:w-[80%]'
            )}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
