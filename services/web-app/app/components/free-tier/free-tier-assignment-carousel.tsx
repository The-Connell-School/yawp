import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight, Lock, Plus } from 'lucide-react';
import { cn } from '~/utils/misc';

export const FREE_TIER_ASSIGNMENT_TILE_SIZE_PX = 168;

export function useFreeTierAssignmentCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const { scrollLeft, scrollWidth, clientWidth } = track;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(track);
    return () => observer.disconnect();
  }, [updateScrollState]);

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const delta = Math.max(
      track.clientWidth * 0.85,
      FREE_TIER_ASSIGNMENT_TILE_SIZE_PX
    );
    track.scrollBy({ left: direction * delta, behavior: 'smooth' });
  }, []);

  return {
    trackRef,
    canScrollLeft,
    canScrollRight,
    scrollByPage,
    updateScrollState,
  };
}

export function FreeTierAssignmentCarouselControls({
  onScrollLeft,
  onScrollRight,
  canScrollLeft,
  canScrollRight,
}: {
  onScrollLeft: () => void;
  onScrollRight: () => void;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}) {
  return (
    <span
      className="inline-flex gap-1.5"
      data-testid="free-tier-assignment-carousel-controls"
    >
      <button
        type="button"
        aria-label="Scroll assignments left"
        disabled={!canScrollLeft}
        onClick={onScrollLeft}
        className="inline-flex size-[30px] items-center justify-center rounded-full border bg-background text-foreground enabled:hover:bg-muted disabled:opacity-40"
      >
        <ChevronLeft size={14} aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Scroll assignments right"
        disabled={!canScrollRight}
        onClick={onScrollRight}
        className="inline-flex size-[30px] items-center justify-center rounded-full border bg-background text-foreground enabled:hover:bg-muted disabled:opacity-40"
      >
        <ChevronRight size={14} aria-hidden />
      </button>
    </span>
  );
}

export function FreeTierAssignmentCarouselTrack({
  trackRef,
  onScroll,
  children,
  className,
}: {
  trackRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      ref={trackRef}
      data-testid="free-tier-assignment-carousel-track"
      onScroll={onScroll}
      className={cn(
        'free-tier-assignment-carousel-track flex gap-3 overflow-x-auto pb-1 no-scrollbar scroll-smooth snap-x snap-mandatory',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Frosted chip on assignment tiles and PE3 class-card menu overlay. */
export function freeTierGlassyOverlayChipClassName(extra?: string) {
  return cn(
    'rounded-full bg-white/92 shadow-[0_0_0_1px_hsl(var(--border))]',
    extra
  );
}

export function FreeTierAssignmentTileImageBadge({
  variant,
}: {
  variant: 'create' | 'locked';
}) {
  return (
    <span
      role="img"
      aria-label={variant === 'create' ? 'Create' : 'Locked'}
      className={cn(
        'absolute right-2 top-2 flex size-7 items-center justify-center',
        freeTierGlassyOverlayChipClassName()
      )}
    >
      {variant === 'create' ? (
        <Plus size={14} aria-hidden className="text-foreground" />
      ) : (
        <Lock size={14} aria-hidden className="text-foreground" />
      )}
    </span>
  );
}

export function freeTierAssignmentTileShellClassName(extra?: string) {
  return cn(
    'flex w-[168px] shrink-0 snap-start flex-col overflow-hidden rounded-xl text-left shadow-sm ring-1 ring-black/[0.06]',
    extra
  );
}

export function freeTierAssignmentTileImageWrapClassName(extra?: string) {
  return cn('relative block size-[168px] shrink-0', extra);
}
