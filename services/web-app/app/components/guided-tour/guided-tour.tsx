/**
 * The page tour a free classroom teacher sees in place of a hands-on
 * orientation: a welcome card on each page they land on, and, if they take the
 * tour, a spotlight that walks through the page one element at a time.
 *
 * Mounted once in the app shell. It picks the tour from the URL; pages only
 * mark what a step points at with `data-tour="..."`. What each tour says lives
 * in app/domain/guided-tours/tours.ts.
 */
import * as PopoverPrimitive from '@radix-ui/react-popover';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CogIcon,
  Compass,
  FileText,
  House,
  Lightbulb,
  MonitorPlay,
  NotebookPen,
  School,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import { Button } from '~/components/ui/button';
import {
  tourForPage,
  type PageTour,
  type TourIcon,
  type TourId,
  type TourStatus,
} from '~/domain/guided-tours/tours';
import { cn } from '~/utils/misc';

const ICONS: Record<TourIcon, typeof House> = {
  home: House,
  classes: Users,
  class: School,
  assignments: NotebookPen,
  documents: FileText,
  practice: BookOpen,
  lounge: MonitorPlay,
  planner: Lightbulb,
  organization: CogIcon,
  'assignment-type': NotebookPen,
};

/** About how big the step card is, to tell which side of an element it fits. */
const STEP_CARD_HEIGHT = 240;
const STEP_CARD_WIDTH = 396;
/** Room left around the spotlighted element, in pixels. */
const SPOTLIGHT_PADDING = 8;
/** Sent by the "Tour this page" button in the sidebar. */
const START_EVENT = 'yawp:page-tour-start';
/** Sent by "Restart all tours" once the server has forgotten them. */
const RESET_EVENT = 'yawp:page-tour-reset';
/** Let the page draw before the welcome card slides in. */
const WELCOME_DELAY_MS = 400;

type Rect = { top: number; left: number; width: number; height: number };

type ActiveStep = { target: string | null; title: string; body: string };

type Phase =
  | { kind: 'idle' }
  | { kind: 'welcome' }
  | { kind: 'touring'; steps: ActiveStep[]; index: number };

function findTarget(target: string | null) {
  if (!target || typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}

/** On screen at all: not display:none, not slid off the side like the phone nav. */
function isShown(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

function sameRect(a: Rect | null, b: Rect | null) {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.top === b.top &&
      a.left === b.left &&
      a.width === b.width &&
      a.height === b.height)
  );
}

type Placement = 'bottom' | 'top' | 'right' | 'left' | 'corner';

/**
 * The first side of the element the step card fits on. When it fits on none
 * (a section filling most of the screen), it sits in the bottom-right corner
 * over the page instead.
 */
function stepCardPlacement(rect: Rect | null): Placement {
  if (!rect) return 'bottom';
  const room = {
    bottom: window.innerHeight - (rect.top + rect.height),
    top: rect.top,
    right: window.innerWidth - (rect.left + rect.width),
    left: rect.left,
  };
  if (room.bottom >= STEP_CARD_HEIGHT) return 'bottom';
  if (room.top >= STEP_CARD_HEIGHT) return 'top';
  if (room.right >= STEP_CARD_WIDTH) return 'right';
  if (room.left >= STEP_CARD_WIDTH) return 'left';
  return 'corner';
}

/** Where the step card is attached, in viewport pixels. */
function cardAnchorStyle(
  rect: Rect | null,
  placement: Placement
): React.CSSProperties {
  if (!rect) return { top: '35%', left: '50%', width: 0, height: 0 };
  if (placement === 'corner') {
    return { bottom: 16, right: 16, width: 0, height: 0 };
  }
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Steps whose element is on this page right now; a centered card if none are. */
function resolveSteps(tour: PageTour): ActiveStep[] {
  const shown = tour.steps.filter((step) => isShown(findTarget(step.target)));
  if (shown.length) return shown;
  return [{ target: null, title: tour.welcome.title, body: tour.welcome.body }];
}

function recordOutcome(tourId: TourId, status: TourStatus) {
  const body = new FormData();
  body.set('tourId', tourId);
  body.set('status', status);
  // A plain request rather than a fetcher: saving this must not reload the
  // page's data underneath the teacher.
  void fetch('/api/guided-tours', { method: 'POST', body }).catch(() => {
    // Not worth interrupting anyone over; the card shows again next visit.
  });
}

/**
 * Everything here is position:fixed against the window, so it renders on
 * <body>: inside the app shell, a transformed ancestor would offset it.
 */
export function GuidedTour(props: { finishedTourIds: readonly string[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<PageTourController {...props} />, document.body);
}

/**
 * The current page's tour. Most pages are known by their URL; a page whose URL
 * is not enough (an assignment type page) names itself with
 * `data-tour-variant`, read once the page has rendered.
 */
function usePageTour() {
  const location = useLocation();
  const [variant, setVariant] = useState<string | null>(null);
  useEffect(() => {
    setVariant(
      document
        .querySelector('[data-tour-variant]')
        ?.getAttribute('data-tour-variant') ?? null
    );
  }, [location.pathname, location.key]);
  return tourForPage(location.pathname, variant);
}

function PageTourController({
  finishedTourIds,
}: {
  finishedTourIds: readonly string[];
}) {
  const tour = usePageTour();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // Outcomes from this visit, so a card stays closed before the server's
  // list catches up.
  const [finishedHere, setFinishedHere] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  // After "Restart all tours" the server has no rows left, so the list this
  // page loaded with is out of date until the next full load.
  const [restarted, setRestarted] = useState(false);
  const tourId = tour?.id ?? null;
  const finished =
    tourId !== null &&
    ((!restarted && finishedTourIds.includes(tourId)) ||
      finishedHere.has(tourId));

  useEffect(() => {
    setPhase({ kind: 'idle' });
    if (!tourId || finished) return;
    const timer = window.setTimeout(
      () => setPhase({ kind: 'welcome' }),
      WELCOME_DELAY_MS
    );
    return () => window.clearTimeout(timer);
    // Only a new page (or a first visit) opens the card.
  }, [tourId]);

  const finish = useCallback(
    (status: TourStatus) => {
      if (!tour) return;
      setPhase({ kind: 'idle' });
      setFinishedHere((prev) => new Set(prev).add(tour.id));
      recordOutcome(tour.id, status);
    },
    [tour]
  );

  const start = useCallback(() => {
    if (!tour) return;
    setPhase({ kind: 'touring', steps: resolveSteps(tour), index: 0 });
  }, [tour]);

  useEffect(() => {
    window.addEventListener(START_EVENT, start);
    return () => window.removeEventListener(START_EVENT, start);
  }, [start]);

  useEffect(() => {
    const restart = () => {
      setRestarted(true);
      setFinishedHere(new Set());
      if (tourId) setPhase({ kind: 'welcome' });
    };
    window.addEventListener(RESET_EVENT, restart);
    return () => window.removeEventListener(RESET_EVENT, restart);
  }, [tourId]);

  if (!tour) return null;

  if (phase.kind === 'welcome') {
    return (
      <WelcomeCard
        tour={tour}
        onTakeTour={start}
        onSkip={() => finish('dismissed')}
      />
    );
  }

  if (phase.kind === 'touring') {
    return (
      <TourSpotlight
        steps={phase.steps}
        index={phase.index}
        onIndexChange={(index) => setPhase({ ...phase, index })}
        // Closing partway is not skipping: nothing is recorded, so the
        // welcome card comes back next visit.
        onClose={() => setPhase({ kind: 'idle' })}
        onFinish={() => finish('completed')}
      />
    );
  }

  return null;
}

function WelcomeCard({
  tour,
  onTakeTour,
  onSkip,
}: {
  tour: PageTour;
  onTakeTour: () => void;
  onSkip: () => void;
}) {
  const Icon = ICONS[tour.welcome.icon];
  const titleId = `guided-tour-welcome-${tour.id}`;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="guided-tour-welcome"
      className="fixed inset-x-4 bottom-4 z-50 rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-300 motion-reduce:animate-none print:hidden sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[400px]"
    >
      <div className="flex gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon size={20} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 id={titleId} className="text-base font-semibold">
              {tour.welcome.title}
            </h2>
            <button
              type="button"
              onClick={onSkip}
              aria-label="Close"
              className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tour.welcome.body}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Button type="button" size="sm" onClick={onTakeTour}>
              <Sparkles size={16} className="mr-1.5" aria-hidden="true" />
              Take a tour
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onSkip}>
              Skip
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Replays the current page's tour. Lives in the sidebar so it never covers
 * page content; renders nothing on pages without a tour.
 */
export function TourThisPageButton({
  navExpanded,
  onClick,
}: {
  navExpanded: boolean;
  onClick?: () => void;
}) {
  const tour = usePageTour();
  if (!tour) return null;
  return (
    <button
      type="button"
      aria-label="Tour this page"
      onClick={() => {
        onClick?.();
        window.dispatchEvent(new Event(START_EVENT));
      }}
      className="flex items-center gap-2 border-t px-4 py-3 text-left text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
    >
      <Compass size={18} aria-hidden="true" />
      {navExpanded ? <span>Tour this page</span> : null}
    </button>
  );
}

/**
 * Forgets every tour the teacher finished or skipped, so each page greets
 * them again, starting with this one. Lives in the Settings menu.
 */
export function RestartToursButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      className={className}
      onClick={async () => {
        setPending(true);
        const body = new FormData();
        body.set('intent', 'reset');
        try {
          const response = await fetch('/api/guided-tours', {
            method: 'POST',
            body,
          });
          if (response.ok) window.dispatchEvent(new Event(RESET_EVENT));
        } finally {
          setPending(false);
        }
      }}
    >
      <Compass size={16} aria-hidden="true" />
      Restart all tours
    </Button>
  );
}

function TourSpotlight({
  steps,
  index,
  onIndexChange,
  onClose,
  onFinish,
}: {
  steps: ActiveStep[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onFinish: () => void;
}) {
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const titleId = 'guided-tour-step-title';

  // Bring the step's element into view and mark it, so it can be styled or
  // checked while it is the one being explained.
  useEffect(() => {
    const el = findTarget(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    el.setAttribute('data-tour-active', 'true');
    el.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    return () => el.removeAttribute('data-tour-active');
  }, [step.target]);

  // Follow the element while the page scrolls, resizes, or animates in.
  useEffect(() => {
    if (!step.target) return;
    let frame = 0;
    const measure = () => {
      const el = findTarget(step.target);
      const box = el?.getBoundingClientRect();
      const next = box
        ? {
            top: box.top - SPOTLIGHT_PADDING,
            left: box.left - SPOTLIGHT_PADDING,
            width: box.width + SPOTLIGHT_PADDING * 2,
            height: box.height + SPOTLIGHT_PADDING * 2,
          }
        : null;
      setRect((prev) => (sameRect(prev, next) ? prev : next));
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    return () => window.cancelAnimationFrame(frame);
  }, [step.target]);

  const placement = stepCardPlacement(rect);

  return (
    <PopoverPrimitive.Root
      open
      modal
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* Dims the page and keeps clicks off it while the tour is open. */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 print:hidden',
          !rect && 'bg-black/45'
        )}
      />
      {rect ? (
        <div
          aria-hidden="true"
          data-testid="guided-tour-spotlight"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
          className="pointer-events-none fixed z-40 rounded-xl shadow-[0_0_0_9999px_rgb(0_0_0/0.45)] ring-2 ring-primary transition-all duration-200 motion-reduce:transition-none print:hidden"
        />
      ) : null}
      <PopoverPrimitive.Anchor asChild>
        <div
          aria-hidden="true"
          style={cardAnchorStyle(rect, placement)}
          className="pointer-events-none fixed"
        />
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-testid="guided-tour-step"
          aria-labelledby={titleId}
          side={placement === 'corner' ? 'top' : placement}
          align={!rect ? 'center' : placement === 'corner' ? 'end' : 'start'}
          sideOffset={placement === 'corner' ? 0 : 12}
          collisionPadding={16}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nextRef.current?.focus();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          className="z-50 w-[min(380px,calc(100vw-32px))] rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg outline-none animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none print:hidden"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold">
                {step.title}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Step {index + 1} of {steps.length}
              </p>
            </div>
            <PopoverPrimitive.Close
              aria-label="Close tour"
              className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <X size={18} />
            </PopoverPrimitive.Close>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{step.body}</p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <ProgressPills count={steps.length} index={index} />
            <div className="flex items-center gap-2">
              {index > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label="Previous step"
                  onClick={() => onIndexChange(index - 1)}
                >
                  <ChevronLeft size={16} />
                </Button>
              ) : null}
              <Button
                ref={nextRef}
                type="button"
                size="sm"
                onClick={() => (isLast ? onFinish() : onIndexChange(index + 1))}
              >
                {isLast ? 'Finish' : 'Next'}
                {isLast ? null : (
                  <ChevronRight size={16} className="ml-1" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function ProgressPills({ count, index }: { count: number; index: number }) {
  if (count < 2) return <span />;
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all motion-reduce:transition-none',
            i === index
              ? 'w-6 bg-primary'
              : i < index
                ? 'w-4 bg-primary/40'
                : 'w-4 bg-muted'
          )}
        />
      ))}
    </div>
  );
}
