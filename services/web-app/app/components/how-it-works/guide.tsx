/**
 * Building blocks for "See how it works" guides: the short, teacher-facing
 * tour each feature opens from its header. See docs/how-to-guides.md for what
 * a guide says and what it leaves out.
 *
 * A guide is a page of these pieces: a hero, a few clip-and-text rows, and the
 * will / won't section a school reads before approving the feature.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Check, ChevronLeft, CirclePlay, Pause, Play, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';

/**
 * The way into a guide, for a feature's page header. It shrinks to its icon
 * on a phone and keeps its name for screen readers.
 */
export function SeeHowItWorksLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      aria-label="See how it works"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-background px-2.5 text-sm font-medium text-primary transition hover:bg-primary/10 sm:px-3"
    >
      <CirclePlay size={16} />
      <span className="hidden sm:inline">See how it works</span>
    </Link>
  );
}

/** The scrolling page every guide sits in, with the way back on top. */
export function GuidePage({
  backTo,
  backLabel,
  children,
}: {
  backTo: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    // Own the scroll: the app shell is a fixed-height, overflow-hidden frame.
    <section className="h-full w-full overflow-y-auto">
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
  );
}

export function GuideHero({
  title,
  highlight,
  lede,
  image,
}: {
  title: string;
  highlight: string;
  lede: string;
  image: {
    src: string;
    alt: string;
    width: number;
    height: number;
    caption: string;
  };
}) {
  return (
    <header className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
      <div className="flex flex-col gap-4">
        <Eyebrow>See how it works</Eyebrow>
        <h1 className="text-3xl font-bold leading-tight md:text-5xl">
          {title} <span className="text-primary">{highlight}</span>
        </h1>
        <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
          {lede}
        </p>
      </div>
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
        <figcaption className="text-xs text-muted-foreground">
          {image.caption}
        </figcaption>
      </figure>
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
        className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white backdrop-blur focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {playing ? <Pause size={11} /> : <Play size={11} />}
        {playing ? 'Pause' : 'Play'}
      </button>
    </div>
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
  return (
    <ul
      data-testid={testId}
      className="flex max-w-prose list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-muted-foreground marker:text-primary"
    >
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
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
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-primary">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary">
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
  return (
    <section aria-labelledby={id} className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2
          id={id}
          className="text-2xl font-semibold leading-tight md:text-3xl"
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export function GuideH3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold leading-snug">{children}</h3>;
}

export function GuideCopy({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * What the feature will and won't do. Every line has to be true in the code;
 * this is the section a school reads before it approves the feature.
 */
export function WillWont({ will, wont }: { will: string[]; wont: string[] }) {
  return (
    <section
      aria-labelledby="guide-will"
      className="flex flex-col gap-8 rounded-2xl bg-secondary p-6 md:p-10"
    >
      <div className="flex flex-col gap-3">
        <Eyebrow>At a glance</Eyebrow>
        <h2
          id="guide-will"
          className="text-2xl font-semibold leading-tight md:text-3xl"
        >
          What it will do, and what it won’t
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border bg-background p-5">
          <GuideH3>It will</GuideH3>
          <ul className="flex flex-col gap-2 text-[15px] text-muted-foreground">
            {will.map((item) => (
              <li key={item} className="flex gap-2">
                <Check size={16} className="mt-1 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div
          data-testid="guide-wont"
          className="flex flex-col gap-3 rounded-xl border bg-background p-5"
        >
          <GuideH3>It won’t</GuideH3>
          <ul className="flex flex-col gap-2 text-[15px] text-muted-foreground">
            {wont.map((item) => (
              <li key={item} className="flex gap-2">
                <X size={16} className="mt-1 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
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
  return (
    <footer className="flex flex-col items-start gap-4 border-t pt-6">
      <p className="text-xs text-muted-foreground">{note}</p>
      <Button asChild>
        <Link to={startTo}>{startLabel}</Link>
      </Button>
    </footer>
  );
}
