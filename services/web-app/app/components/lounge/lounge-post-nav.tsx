import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LoungeAdjacentPost } from '~/domain/lounge/lounge.server';
import { cn } from '~/utils/misc';

type Adjacent = { previous: LoungeAdjacentPost | null; next: LoungeAdjacentPost | null };

/**
 * At the bottom of a post: the newer post on the left and the older one on
 * the right, each with a look at what it says, so a teacher can keep reading
 * without going back to the feed. Plain links, so it works before JavaScript.
 */
export function LoungePostNav({ previous, next }: Adjacent) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="More posts" className="grid gap-3 border-t pt-6 sm:grid-cols-2">
      {previous ? <NavCard post={previous} direction="previous" /> : <span className="hidden sm:block" />}
      {next ? <NavCard post={next} direction="next" /> : null}
    </nav>
  );
}

function NavCard({ post, direction }: { post: LoungeAdjacentPost; direction: 'previous' | 'next' }) {
  const isNext = direction === 'next';
  return (
    <Link
      to={`/app/lounge/${post.id}`}
      className={cn(
        'flex flex-col gap-1.5 rounded-xl border bg-popover p-4 hover:border-foreground/40',
        isNext && 'sm:items-end sm:text-right'
      )}
    >
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        {isNext ? null : <ChevronLeft size={16} aria-hidden="true" />}
        {isNext ? 'Next post' : 'Previous post'}
        {isNext ? <ChevronRight size={16} aria-hidden="true" /> : null}
      </span>
      <span className="lounge-serif text-[20px] leading-tight text-foreground">{post.title}</span>
      {post.excerpt ? <span className="line-clamp-2 text-sm text-foreground/80">{post.excerpt}</span> : null}
      <span className="text-xs text-muted-foreground">
        {post.kindLabel} · {post.authorName}
      </span>
    </Link>
  );
}

/** The short version for the top of a post, beside the way back to the feed. */
export function LoungePostNavCompact({ previous, next }: Adjacent) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Previous and next post" className="flex items-center gap-1 text-sm">
      {previous ? (
        <Link
          to={`/app/lounge/${previous.id}`}
          title={previous.title}
          className="inline-flex min-h-11 items-center gap-1 px-2 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Previous
        </Link>
      ) : null}
      {previous && next ? (
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
      ) : null}
      {next ? (
        <Link
          to={`/app/lounge/${next.id}`}
          title={next.title}
          className="inline-flex min-h-11 items-center gap-1 px-2 text-muted-foreground hover:text-foreground"
        >
          Next
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
