/**
 * Options side by side (Kevin's notes on the latest run): two or three class
 * starters, exit tickets or framing cards from one reply sit in one row the
 * teacher pages through with arrows, instead of a tall stack of near-copies.
 * Every card stays on the page with its own buttons; the row only scrolls.
 */
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '~/utils/misc';

export function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  const items = Children.toArray(children);
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  // Which option is showing: the one whose left edge is nearest the row's.
  const onScroll = useCallback(() => {
    const row = track.current;
    if (!row) return;
    const cards = Array.from(row.children) as HTMLElement[];
    let nearest = 0;
    cards.forEach((card, index) => {
      const gap = Math.abs(card.offsetLeft - row.offsetLeft - row.scrollLeft);
      const best = Math.abs(cards[nearest]!.offsetLeft - row.offsetLeft - row.scrollLeft);
      if (gap < best) nearest = index;
    });
    setAt(nearest);
  }, []);

  useEffect(onScroll, [onScroll]);

  const go = (index: number) => {
    const row = track.current;
    const card = row?.children[index] as HTMLElement | undefined;
    if (!row || !card) return;
    row.scrollTo({ left: card.offsetLeft - row.offsetLeft, behavior: 'smooth' });
    setAt(index);
  };

  return (
    <div data-testid="option-row" className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} · <span data-testid="option-row-position">{at + 1} of {items.length}</span>
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous option"
            data-testid="option-prev"
            disabled={at === 0}
            onClick={() => go(at - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border bg-background text-foreground transition hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            aria-label="Next option"
            data-testid="option-next"
            disabled={at >= items.length - 1}
            onClick={() => go(at + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border bg-background text-foreground transition hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div
        ref={track}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]"
      >
        {items.map((item, index) => (
          <div
            key={index}
            data-testid="option-row-item"
            aria-label={`Option ${index + 1} of ${items.length}`}
            className={cn('w-[88%] shrink-0 snap-start [&>*]:mt-0', items.length === 1 && 'w-full')}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
