/**
 * "See how it works": a short, teacher-facing tour of the Lesson Planner.
 *
 * It is the teaser, not the manual. Each section says what the planner does in
 * a line or two and lets a clip show the rest, because a teacher learns this
 * feature by using it. The one section written for a reader who is deciding
 * whether to allow it — what it will and will not do — is the one place that
 * spells things out.
 *
 * The clips were recorded in the planner with demo classes and live in
 * public/img/lesson-planner-guide, so the page works without reaching any
 * outside site.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, redirect, type LoaderFunctionArgs } from 'react-router';
import { Check, ChevronLeft, Pause, Play, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';

const MEDIA = '/img/lesson-planner-guide';

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');
  return null;
}

/**
 * A looping, muted clip. It stops for anyone who has asked their system for
 * less motion, and it always carries its own pause control.
 */
function Clip({ name, label }: { name: string; label: string }) {
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
        poster={`${MEDIA}/${name}.jpg`}
        aria-label={label}
      >
        <source src={`${MEDIA}/${name}.mp4`} type="video/mp4" />
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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
      {children}
    </p>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
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
function Row({
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

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-semibold leading-tight md:text-3xl">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold leading-snug">{children}</h3>;
}

function Copy({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function Ticks({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-[15px] text-muted-foreground">
      {items.map((item, i) => (
        <li key={i} className="relative pl-4">
          <span className="absolute left-0 top-[0.7em] h-px w-2 bg-primary" />
          {item}
        </li>
      ))}
    </ul>
  );
}

const PERIOD = [
  { minutes: 5, what: 'Class Starter' },
  { minutes: 10, what: 'Mini-lesson: the same quote used two ways' },
  { minutes: 15, what: 'Partner work on three excerpts from chapter 3' },
  { minutes: 12, what: 'Independent paragraph' },
  { minutes: 3, what: 'Transition', gap: true },
  { minutes: 5, what: 'Exit ticket' },
];

const WILL = [
  'Plan lessons and full units for your classes.',
  'Write the slides, handouts, answer keys and exit tickets.',
  'Use how your class has been scoring in YAWP! to aim the lesson.',
  'Leave everything for you to edit before students see it.',
];

const WONT = [
  'Assign anything to students. Only you can.',
  'Talk to students. It’s for teachers only.',
  'Read students’ essays. It sees how a class scored, not what students wrote.',
  'Make up class data, grades or student names.',
  'Cite a study, statistic or standard it isn’t sure of.',
  'Share your lessons with other teachers. They stay in your account.',
];

export default function LessonPlannerHowItWorksRoute() {
  return (
    // Own the scroll: the app shell is a fixed-height, overflow-hidden frame.
    <section className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 pb-20 pt-6 md:gap-20">
        <div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/lesson-planner">
              <ChevronLeft size={16} className="mr-1" />
              Back to the planner
            </Link>
          </Button>
        </div>

        <header className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          <div className="flex flex-col gap-4">
            <Eyebrow>See how it works</Eyebrow>
            <h1 className="text-3xl font-bold leading-tight md:text-5xl">
              Tomorrow’s lesson, planned for{' '}
              <span className="text-primary">
                the class you actually teach.
              </span>
            </h1>
            <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
              Describe your lesson in your own words. The planner writes a timed
              plan with the slides, handouts and exit ticket already made.
            </p>
          </div>
          <figure className="flex flex-col items-center gap-2">
            <div className="rotate-1 rounded-2xl border bg-background p-2 shadow-lg">
              <img
                src={`${MEDIA}/hero.jpg`}
                alt="A projected slide titled ‘Same quote. Which one taught you something?’ comparing two versions of a sentence about Candy’s dog in Of Mice and Men."
                width={1120}
                height={717}
                className="block h-auto w-full rounded-lg"
              />
            </div>
            <figcaption className="text-xs text-muted-foreground">
              From a deck the planner built for an Of Mice and Men lesson
            </figcaption>
          </figure>
        </header>

        <section aria-labelledby="guide-start" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Eyebrow>Where it lives</Eyebrow>
            <H2 id="guide-start">In the sidebar, right under Reporter</H2>
            <Copy>
              Open <strong className="text-foreground">Lesson Planner</strong>{' '}
              and there is one question on the page:{' '}
              <em>What are we teaching?</em> Type it in your own words, or start
              from one of the 13 starter tiles.
            </Copy>
          </div>
          <Clip
            name="home"
            label="From the dashboard, the Lesson Planner link opens the planner, and the page scrolls through the starter tiles."
          />
          <Row
            flip
            media={
              <Clip
                name="summary"
                label="On a Class Summary, the Plan this lesson link opens the planner with the message already written."
              />
            }
          >
            <Eyebrow>Or start from your data</Eyebrow>
            <H3>“Plan this lesson,” from any Class Summary</H3>
            <Copy>
              When YAWP! summarizes how a class did on an assignment, each
              suggested next step gets a{' '}
              <strong className="text-foreground">Plan this lesson</strong>{' '}
              link. The planner opens with the message already written from that
              summary.
            </Copy>
          </Row>
        </section>

        <section aria-labelledby="guide-plan" className="flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <Eyebrow>For teachers</Eyebrow>
            <H2 id="guide-plan">From one sentence to a timed lesson plan</H2>
          </div>

          <Row
            media={
              <Clip
                name="ask"
                label="A teacher describes an English 10 class, taps a suggested reply, sets the lesson length to 50 minutes, checks three activities and sends."
              />
            }
          >
            <Step n={1}>Tell it about the class</Step>
            <H3>It asks, you tap</H3>
            <Copy>
              Answers are one tap: suggested replies, a slider for the period
              length, and a checklist of activity types.
            </Copy>
          </Row>

          <Row
            flip
            media={
              <Clip
                name="plan"
                label="Scrolling a finished plan: a timing table, Class Starter prompts, a sample paragraph, a handout, an answer key and an exit ticket."
              />
            }
          >
            <Step n={2}>Read the plan</Step>
            <H3>Every minute accounted for</H3>
            <Copy>
              Based on the length of your class, the planner creates a timed
              sequence that adds up to the period.
            </Copy>
            <Copy>
              Use the entire plan as is, or choose the parts you want.
            </Copy>
          </Row>

          <div className="grid items-start gap-6 md:grid-cols-[3fr_2fr]">
            <div
              role="img"
              aria-label="The 50-minute example lesson: 5 minutes Class Starter, 10 mini-lesson, 15 partner work, 12 independent writing, 3 transition, 5 exit ticket."
              className="overflow-hidden rounded-xl border bg-background"
            >
              <div className="flex h-2.5">
                {PERIOD.map((step, i) => (
                  <span
                    key={i}
                    style={{ flex: step.minutes }}
                    className={cn(
                      'block h-full',
                      step.gap
                        ? 'bg-border'
                        : i % 2
                          ? 'bg-primary/45'
                          : 'bg-primary'
                    )}
                  />
                ))}
              </div>
              <ol className="px-4 py-1.5">
                {PERIOD.map((step) => (
                  <li
                    key={step.what}
                    className="grid grid-cols-[2.6rem_1fr] gap-3 border-b border-dotted py-2 text-sm text-muted-foreground last:border-b-0"
                  >
                    <b className="font-mono text-xs font-medium leading-6 text-primary tabular-nums">
                      {step.minutes}
                    </b>
                    {step.what}
                  </li>
                ))}
              </ol>
              <div className="flex justify-between border-t px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>English 10 · Period 3</span>
                <span>50 min</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <H3>Example lesson plan</H3>
              <Ticks
                items={[
                  'Three Class Starter prompts',
                  'A sample with a weak and a strong paragraph on the same quote',
                  'A handout',
                  'An answer key',
                  'An exit ticket',
                ]}
              />
            </div>
          </div>

          <Row
            media={
              <div className="mx-auto max-w-sm overflow-hidden rounded-xl border bg-background shadow-sm md:max-w-none">
                <img
                  src={`${MEDIA}/exit-ticket.jpg`}
                  alt="The New Assignment form for an Exit Ticket, already filled in from the lesson."
                  width={720}
                  height={964}
                  loading="lazy"
                  className="block h-auto w-full"
                />
              </div>
            }
          >
            <Step n={3}>Assign it</Step>
            <H3>One click from plan to assignment</H3>
            <Copy>
              Send any assignment in the lesson plan to your class with one
              click.
            </Copy>
            <Copy>A link on the form takes you back to your lesson.</Copy>
          </Row>
        </section>

        <section
          aria-labelledby="guide-slides"
          className="flex flex-col gap-10"
        >
          <div className="flex flex-col gap-3">
            <Eyebrow>Slides</Eyebrow>
            <H2 id="guide-slides">A deck you can put on the wall</H2>
            <Copy>
              Once the plan is in, one tap on{' '}
              <strong className="text-foreground">
                Build the slide deck for this lesson
              </strong>{' '}
              makes a real deck, timed to the same period. Present it from YAWP!
              or download it as PowerPoint.
            </Copy>
          </div>
          <Row
            media={
              <Clip
                name="present"
                label="Presenting the lesson’s slide deck from YAWP!, with speaker notes opened beside a slide."
              />
            }
          >
            <H3>Speaker notes included</H3>
            <Copy>
              The notes provide your talking points, with the minutes for each
              slide.
            </Copy>
          </Row>
          <Clip
            name="deck"
            label="Tapping Build the slide deck for this lesson. A card appears with the deck’s thumbnails and Add to stack, PowerPoint and Present buttons."
          />
        </section>

        <section aria-labelledby="guide-stack" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Eyebrow>The stack</Eyebrow>
            <H2 id="guide-stack">
              Everything for the lesson, in one place to print
            </H2>
            <Copy>
              Tap <strong className="text-foreground">Add to stack</strong> on
              the pieces you want to keep. The stack puts the plan, handouts,
              answer key and deck in lesson order, ready to print or save as a
              PDF.
            </Copy>
          </div>
          <Clip
            name="stack"
            label="Adding the handout, answer key and deck to the stack, then viewing it as a full plan, an outline and a student handout."
          />
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: 'Three views',
                body: 'Full plan for you, Outline for a glance, and Student handout with only what students hold.',
              },
              {
                title: 'Edit anything',
                body: 'Rename the lesson or any piece, and rewrite a handout in the editor.',
              },
              {
                title: 'Keep the good ones',
                body: 'Publish to my library saves the lesson under its own name, for next year.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-1.5 border-t-2 border-primary pt-3"
              >
                <H3>{item.title}</H3>
                <Copy>{item.body}</Copy>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="guide-units" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Eyebrow>Units</Eyebrow>
            <H2 id="guide-units">Create a full unit of study</H2>
            <Copy>
              Ask for a unit and you get the map before any lessons: one row per
              day, each with its objective, what students do, the check, and the
              minutes. Every day has its own{' '}
              <strong className="text-foreground">Build this day</strong>{' '}
              button, and each built day becomes its own lesson with its own
              stack.
            </Copy>
          </div>
          <Row
            media={
              <Clip
                name="unit"
                label="Asking for a six-day unit on Of Mice and Men and getting a day-by-day map with a Build this day button on each row."
              />
            }
          >
            <H3>Built toward what they hand in</H3>
            <Ticks
              items={[
                'The map is anchored on the final assignment, and every day feeds into it.',
                'For an essay unit, Class Starters and smaller writing assignments align with the unit’s themes, so students can choose a thesis from their own writing.',
              ]}
            />
          </Row>
        </section>

        <section
          aria-labelledby="guide-will"
          className="flex flex-col gap-8 rounded-2xl bg-secondary p-6 md:p-10"
        >
          <div className="flex flex-col gap-3">
            <Eyebrow>At a glance</Eyebrow>
            <H2 id="guide-will">What it will do, and what it won’t</H2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-xl border bg-background p-5">
              <H3>It will</H3>
              <ul className="flex flex-col gap-2 text-[15px] text-muted-foreground">
                {WILL.map((item) => (
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
              <H3>It won’t</H3>
              <ul className="flex flex-col gap-2 text-[15px] text-muted-foreground">
                {WONT.map((item) => (
                  <li key={item} className="flex gap-2">
                    <X size={16} className="mt-1 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-start gap-4 border-t pt-6">
          <p className="text-xs text-muted-foreground">
            Clips use demo classes. The planner’s replies in them were scripted
            for the recording.
          </p>
          <Button asChild>
            <Link to="/app/lesson-planner">Start planning</Link>
          </Button>
        </footer>
      </div>
    </section>
  );
}
