/**
 * How a deck appears before it is presented: a card with what it is, how long
 * it runs, and a preview of the first few slides — never the JSON it is made
 * of. The teacher's next move is to project it, so that button is the loudest
 * thing on the card.
 */
import { Link } from 'react-router';
import { Check, Download, Play, Plus, Presentation } from 'lucide-react';
import { cn } from '~/utils/misc';
import {
  deckDurationMinutes,
  type SlideDeck,
} from '~/domain/lesson-planner/slide-deck';

export function SlideDeckCard({
  deck,
  presentHref,
  downloadHref,
  added,
  onToggle,
  disabled,
}: {
  deck: SlideDeck;
  /** Absent while the reply is still unsaved and has no id to present by. */
  presentHref: string | null;
  /**
   * The deck as a .pptx. Offered wherever the deck can be presented, because a
   * teacher who can project it should be able to take it to the classroom
   * machine that is not logged into Yawp — or leave it for a substitute.
   */
  downloadHref?: string | null;
  /** Whether this deck is the one currently filed in the lesson stack. */
  added?: boolean;
  /** Absent in the stack itself, where the deck is already filed. */
  onToggle?: ((added: boolean) => void) | null;
  disabled?: boolean;
}) {
  const minutes = deckDurationMinutes(deck);
  const preview = deck.slides.slice(0, 4);

  return (
    <div
      data-testid="slide-deck-card"
      className="overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.04]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/20 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Presentation size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{deck.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              `${deck.slides.length} ${deck.slides.length === 1 ? 'slide' : 'slides'}`,
              minutes > 0 ? `${minutes} min` : null,
              deck.subtitle,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {onToggle ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggle(!added)}
            data-testid="deck-toggle"
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50',
              added
                ? 'bg-primary/10 text-primary hover:bg-primary/15'
                : 'border border-primary/40 text-primary hover:bg-primary/5'
            )}
          >
            {added ? <Check size={14} /> : <Plus size={14} />}
            {added ? 'In the stack' : 'Add to stack'}
          </button>
        ) : null}
        {downloadHref ? (
          <a
            href={downloadHref}
            download
            data-testid="deck-download-pptx"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
          >
            <Download size={14} />
            PowerPoint
          </a>
        ) : null}
        {presentHref ? (
          <Link
            to={presentHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Play size={14} />
            Present
          </Link>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">
            Add this to the stack to present it
          </span>
        )}
      </div>

      {/* Thumbnails: enough to recognize the deck, not to read it. */}
      <ol className="flex gap-2 overflow-x-auto px-4 py-3">
        {preview.map((slide, index) => (
          <li
            key={index}
            className="flex aspect-[16/9] w-32 shrink-0 flex-col justify-center gap-1 rounded-md border bg-background px-2 py-1.5"
          >
            <p className="line-clamp-2 text-[10px] font-semibold leading-tight">
              {slide.title}
            </p>
            {slide.bullets?.length ? (
              <p className="line-clamp-2 text-[9px] leading-tight text-muted-foreground">
                {slide.bullets[0]}
              </p>
            ) : slide.body ? (
              <p className="line-clamp-2 text-[9px] leading-tight text-muted-foreground">
                {slide.body}
              </p>
            ) : null}
          </li>
        ))}
        {deck.slides.length > preview.length ? (
          <li className="flex aspect-[16/9] w-32 shrink-0 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            +{deck.slides.length - preview.length} more
          </li>
        ) : null}
      </ol>
    </div>
  );
}
