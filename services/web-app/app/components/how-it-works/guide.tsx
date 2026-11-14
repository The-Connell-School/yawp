/**
 * Building blocks for "See how it works" guides: the short, teacher-facing
 * tour each feature opens from its header. See docs/how-to-guides.md for what
 * a guide says and what it leaves out.
 *
 * A guide is a page of these pieces: a hero, a few clip-and-text rows, and the
 * will / won't section a school reads before approving the feature.
 *
 * Two looks (Brian, Nov 5). The classic one, with terracotta accents and the
 * small eyebrow labels, is what the Reporter guide still uses. A guide that
 * gives `GuidePage` an `accent` gets the plainer look: no eyebrows, one-color
 * headlines, darker body text, and its one accent color on the buttons, the
 * step circles and the feature panels, which turn that color with white
 * headings and white cards inside. The fixed colors are for the cream page;
 * the dark theme keeps its own tokens.
 */
import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Check, ChevronLeft, CirclePlay, Pause, Play, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';

/** The page's accent color, when it has one; null is the classic look. */
const GuideAccent = createContext<string | null>(null);

function useAccent(): string | null {
  return useContext(GuideAccent);
}

/** Headings on the accented page, one color each. */
const HEADING = 'text-[#1A1F2E] dark:text-foreground';
/** Body text on the accented page: darker, so it reads on the cream. */
const BODY = 'text-[#3A3F4B] dark:text-muted-foreground';

/**
 * The way into a guide, for a feature's page header. It shrinks to its icon
 * on a phone and keeps its name for screen readers.
 */
export function SeeHowItWorksLink({
  to,
  ...linkProps
}: { to: string } & Omit<ComponentProps<typeof Link>, 'to' | 'children'>) {
  return (
    <Button asChild variant="outline-primary" size="sm" className="h-9 shrink-0 gap-1.5 sm:px-3">
      <Link to={to} aria-label="See how it works" {...linkProps}>
        <CirclePlay size={16} />
        <span className="hidden sm:inline">See how it works</span>
      </Link>
    </Button>
  );
}

/** The scrolling page every guide sits in, with the way back on top. */
export function GuidePage({
  backTo,
  backLabel,
  accent,
  children,
}: {
  backTo: string;
  backLabel: string;
  /** The page's one accent color (see guide-accents.ts). Omit for the classic look. */
  accent?: string | null;
  children: React.ReactNode;
}) {
  const style = accent ? ({ '--page-accent': accent } as CSSProperties) : undefined;
  return (
    <GuideAccent.Provider value={accent ?? null}>
      {/* Own the scroll: the app shell is a fixed-height, overflow-hidden frame. */}
      <section
        className="h-full w-full overflow-y-auto"
        style={style}
        data-guide-accent={accent ?? undefined}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 pb-20 pt-6 md:gap-20">
          <div>
            <Button variant="outline" size="sm" asChild>
              <Link to={backTo}>
                <ChevronLeft size={16} className="mr-1" />
                {backLabel}
              </Link>
            </Button>
          </div>
          {children}
        </div>
      </section>
    </GuideAccent.Provider>
  );
}

/** A guide's overview video: where it is, what it shows, and its size. */
export type GuideVideo = {
  src: string;
  poster: string;
  /** What the video shows, for anyone who can't watch it. It has no sound. */
  label: string;
  width: number;
  height: number;
  /** The line under it: how it was made. */
  note?: string;
};

export function GuideHero({
  title,
  highlight,
  lede,
  image,
  video,
}: {
  title: string;
  /** The headline's second phrase: colored in the classic look, plain with an accent. */
  highlight: string;
  lede: string;
  /** Left out on a guide with no picture yet; the text then spans the row. */
  image?: {
    src: string;
    alt: string;
    width: number;
    height: number;
    caption: string;
  };
  /**
   * The page's overview video (Kevin, Nov 10: "put each video at the top of
   * its How It Works page"). It goes right under the headline, full width,
   * and takes the picture's place.
   */
  video?: GuideVideo | null;
}) {
  const accent = useAccent();
  if (video) {
    return (
      <header className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Eyebrow>See how it works</Eyebrow>
          <h1 className={cn('text-3xl font-bold leading-tight md:text-5xl', accent && HEADING)}>
            {accent ? `${title} ${highlight}` : (
              <>
                {title} <span className="text-primary">{highlight}</span>
              </>
            )}
          </h1>
          <p className={cn('max-w-prose text-lg leading-relaxed', accent ? BODY : 'text-muted-foreground')}>
            {lede}
          </p>
        </div>
        <GuideOverviewVideo {...video} />
      </header>
    );
  }
  return (
    <header
      className={cn(
        'grid items-center gap-8 md:gap-12',
        image && 'md:grid-cols-2'
      )}
    >
      <div className="flex flex-col gap-4">
        <Eyebrow>See how it works</Eyebrow>
        <h1 className={cn('text-3xl font-bold leading-tight md:text-5xl', accent && HEADING)}>
          {accent ? `${title} ${highlight}` : (
            <>
              {title} <span className="text-primary">{highlight}</span>
            </>
          )}
        </h1>
        <p className={cn('max-w-prose text-lg leading-relaxed', accent ? BODY : 'text-muted-foreground')}>
          {lede}
        </p>
      </div>
      {image ? (
        <figure className="flex flex-col items-center gap-2">
          <div className="rotate-1 rounded-2xl border bg-background p-2 shadow-lg">
            <img
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              className="block h-auto w-full rounded-lg"
            />
          </div>
          <figcaption className={cn('text-xs', accent ? BODY : 'text-muted-foreground')}>
            {image.caption}
          </figcaption>
        </figure>
      ) : null}
    </header>
  );
}

/**
 * A looping, muted clip. It stops for anyone who has asked their system for
 * less motion, and it always carries its own pause control.
 */
export function GuideClip({
  src,
  poster,
  label,
}: {
  src: string;
  poster: string;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const accent = useAccent();

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.pause();
      setPlaying(false);
    }
  }, []);

  function toggle() {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {});
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border bg-background shadow-sm">
      <video
        ref={ref}
        className="block h-auto w-full"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={poster}
        aria-label={label}
      >
        <source src={src} type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause clip' : 'Play clip'}
        className={cn(
          'absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white backdrop-blur focus-visible:outline focus-visible:outline-2',
          accent ? 'focus-visible:outline-[var(--page-accent)]' : 'focus-visible:outline-primary'
        )}
      >
        {playing ? <Pause size={11} /> : <Play size={11} />}
        {playing ? 'Pause' : 'Play'}
      </button>
    </div>
  );
}

/**
 * The overview video at the top of a guide: a short tour of the feature with
 * no sound, made from demo classes until Brian records his own. Unlike the
 * clips it never plays on its own: the teacher presses play.
 */
export function GuideOverviewVideo({
  src,
  poster,
  label,
  width,
  height,
  note = 'A quick tour, recorded in Yawp! with demo classes. No sound.',
}: GuideVideo) {
  const accent = useAccent();
  return (
    <figure data-testid="guide-overview-video" className="flex flex-col gap-2">
      <GuideCard className={cn('p-2 md:p-3', !accent && 'shadow-lg')}>
        <video
          className="block h-auto w-full rounded-lg bg-black"
          controls
          playsInline
          preload="metadata"
          poster={poster}
          width={width}
          height={height}
          aria-label={label}
        >
          <source src={src} type="video/mp4" />
        </video>
      </GuideCard>
      <figcaption className={cn('text-xs', accent ? BODY : 'text-muted-foreground')}>
        {note}
      </figcaption>
    </figure>
  );
}

/** A still screenshot, framed to match the clips. */
export function GuideImage({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="block h-auto w-full"
      />
    </div>
  );
}

/** A short bulleted list inside a guide row or section. */
export function GuideList({
  items,
  testId,
}: {
  items: React.ReactNode[];
  testId?: string;
}) {
  const accent = useAccent();
  return (
    <ul
      data-testid={testId}
      className={cn(
        'flex max-w-prose list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed',
        accent ? `${BODY} marker:text-[#3A3F4B]` : 'text-muted-foreground marker:text-primary'
      )}
    >
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** The small label over a heading. Gone on an accented page (Brian, Nov 5). */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  const accent = useAccent();
  if (accent) return null;
  return (
    <p
      data-eyebrow
      className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary"
    >
      {children}
    </p>
  );
}

export function GuideStep({
  n,
  children,
}: {
  n: number;
  children: React.ReactNode;
}) {
  const accent = useAccent();
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs font-medium', accent ? HEADING : 'text-primary')}>
      <span
        data-guide-step
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full',
          accent ? 'bg-[var(--page-accent)] text-white' : 'border border-primary'
        )}
      >
        {n}
      </span>
      {children}
    </span>
  );
}

/** A clip beside a short block of text, stacking to one column on a phone. */
export function GuideRow({
  media,
  flip = false,
  children,
}: {
  media: React.ReactNode;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-6 md:gap-10',
        flip ? 'md:grid-cols-[5fr_7fr]' : 'md:grid-cols-[7fr_5fr]'
      )}
    >
      <div className={cn('min-w-0', flip && 'md:order-2')}>{media}</div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </div>
  );
}

export function GuideSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  const accent = useAccent();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2
          id={id}
          className={cn('text-2xl font-semibold leading-tight md:text-3xl', accent && HEADING)}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/**
 * A big feature panel ("How the Tutor works with students"): tan in the
 * classic look; the page's accent with a white heading and a white intro
 * under it on an accented page (Brian, Nov 5).
 */
export function GuidePanel({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  /** Shown in the classic look only. */
  eyebrow?: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  const accent = useAccent();
  return (
    <section
      aria-labelledby={id}
      data-guide-panel
      className={cn(
        'flex flex-col gap-10 rounded-2xl p-6 md:p-10',
        accent ? 'bg-[var(--page-accent)]' : 'bg-secondary'
      )}
    >
      <div className="flex flex-col gap-3">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2
          id={id}
          className={cn('text-2xl font-semibold leading-tight md:text-3xl', accent && 'text-white')}
        >
          {title}
        </h2>
        {intro ? (
          <p
            data-guide-panel-intro
            className={cn('max-w-prose text-lg leading-relaxed', accent ? 'text-white/[0.86]' : 'text-muted-foreground')}
          >
            {intro}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** A card inside a panel: bordered in the classic look, white with a soft shadow on an accented page. */
export function GuideCard({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const accent = useAccent();
  return (
    <div
      data-guide-card
      data-testid={testId}
      className={cn(
        'flex flex-col gap-3 rounded-xl p-5',
        accent ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] dark:bg-background' : 'border bg-background',
        className
      )}
    >
      {children}
    </div>
  );
}

export function GuideH3({ children }: { children: React.ReactNode }) {
  const accent = useAccent();
  return <h3 className={cn('text-lg font-semibold leading-snug', accent && HEADING)}>{children}</h3>;
}

export function GuideCopy({ children }: { children: React.ReactNode }) {
  const accent = useAccent();
  return (
    <p
      data-guide-copy
      className={cn('max-w-prose text-[15px] leading-relaxed', accent ? BODY : 'text-muted-foreground')}
    >
      {children}
    </p>
  );
}

/** A text link on an accented page: the text color, underlined; terracotta in the classic look. */
export function GuideLink({ to, children }: { to: string; children: React.ReactNode }) {
  const accent = useAccent();
  return (
    <Link
      to={to}
      className={cn(
        'text-[15px] font-medium underline-offset-4 hover:underline',
        accent ? `${HEADING} underline` : 'text-link'
      )}
    >
      {children}
    </Link>
  );
}

/**
 * What the feature will and won't do. Every line has to be true in the code;
 * this is the section a school reads before it approves the feature.
 */
export function WillWont({ will, wont }: { will: string[]; wont: string[] }) {
  const accent = useAccent();
  const icon = cn('mt-1 shrink-0', accent ? 'text-[#3A3F4B]' : 'text-primary');
  const list = cn('flex flex-col gap-2 text-[15px]', accent ? BODY : 'text-muted-foreground');
  return (
    <GuidePanel id="guide-will" eyebrow="At a glance" title="What it will do, and what it won’t">
      <div className="grid gap-4 md:grid-cols-2">
        <GuideCard testId="guide-will">
          <GuideH3>It will</GuideH3>
          <ul className={list} data-guide-will>
            {will.map((item) => (
              <li key={item} className="flex gap-2">
                <Check size={16} className={icon} />
                {item}
              </li>
            ))}
          </ul>
        </GuideCard>
        <GuideCard testId="guide-wont">
          <GuideH3>It won’t</GuideH3>
          <ul className={list}>
            {wont.map((item) => (
              <li key={item} className="flex gap-2">
                <X size={16} className={icon} />
                {item}
              </li>
            ))}
          </ul>
        </GuideCard>
      </div>
    </GuidePanel>
  );
}

export function GuideFooter({
  note,
  startTo,
  startLabel,
}: {
  note: string;
  startTo: string;
  startLabel: string;
}) {
  const accent = useAccent();
  return (
    <footer className="flex flex-col items-start gap-4 border-t pt-6">
      <p className={cn('text-xs', accent ? BODY : 'text-muted-foreground')}>{note}</p>
      <Button asChild className={cn(accent && 'bg-[var(--page-accent)] text-white hover:bg-[var(--page-accent)] hover:opacity-90')}>
        <Link to={startTo}>{startLabel}</Link>
      </Button>
    </footer>
  );
}
