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
 *
 * The guide follows the planner as it changes: a section about a feature
 * behind a review flag shows only where that flag is on, so a teacher never
 * reads about something their planner does not do.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Check, ChevronLeft, Pause, Play, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';

const MEDIA = '/img/lesson-planner-guide';

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  return {
    stackV2: flags.stackV2,
    stackV3: flags.stackV3,
    share: flags.share,
    runShow: flags.runShow,
    templates: flags.templates,
    deckGallery: flags.deckGallery,
    uploads: flags.uploads,
  };
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

/** The quote both versions on the hero slide are built on. */
const CANDY_QUOTE = '“I shouldn’t ought to of let no stranger shoot my dog.”';

/** A line from the novel, set apart from the student’s own words. */
function Quoted({ children }: { children: React.ReactNode }) {
  return <span className="font-serif italic text-primary">{children}</span>;
}

/**
 * The hero: a slide from a planned lesson, drawn rather than screenshotted so
 * the quote reads as a quote. Two student paragraphs use the same line from
 * the novel; only one of them does anything with it.
 */
function QuoteSlide() {
  const versions = [
    {
      label: 'Version A',
      verdict: 'Drops the quote in and moves on',
      body: (
        <>
          Candy is sad about his dog. Steinbeck writes,{' '}
          <Quoted>{CANDY_QUOTE}</Quoted> This shows Candy feels bad.
        </>
      ),
    },
    {
      label: 'Version B',
      verdict: 'Reads one word of it closely',
      body: (
        <>
          Candy says, <Quoted>{CANDY_QUOTE}</Quoted> His regret is that he let a
          stranger do it. The word “stranger” carries the weight: the dog was
          his responsibility, and he handed it away.
        </>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-secondary/40 p-4 sm:p-5">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Slide 4 of 8 · Of Mice and Men, chapter 3
      </p>
      <p className="text-lg font-bold leading-snug sm:text-xl">
        Same quote. Which one taught you something?
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {versions.map((version) => (
          <div
            key={version.label}
            className="flex flex-col gap-1.5 rounded-md border bg-background p-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              {version.label}
            </p>
            <p className="text-[13px] leading-relaxed">{version.body}</p>
            <p className="mt-auto border-t border-dotted pt-1.5 text-[11px] text-muted-foreground">
              {version.verdict}
            </p>
          </div>
        ))}
      </div>
    </div>
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
  'Work with you. It asks about your class, and you make the calls on what’s best for it.',
  'Plan lessons and full units for your classes.',
  'Write the slides, handouts, answer keys, and exit tickets.',
  'Use how your class has been scoring in Yawp! to aim the lesson.',
  'Leave everything for you to edit before students see it.',
];

function wontList(share: boolean) {
  return [
    'Assign anything to students. Only you can.',
    'Talk to students. It’s for teachers only.',
    'Read students’ essays. It sees how a class scored, not what students wrote.',
    'Make up class data, grades, or student names.',
    'Cite a study, statistic, or standard it isn’t sure of.',
    share
      ? 'Share your lessons on its own. A lesson leaves your account only when you post or send it.'
      : 'Share your lessons with other teachers. They stay in your account.',
  ];
}

/** A still beside its words, sized like a card rather than a screen. */
function Still({ name, alt, width, height }: { name: string; alt: string; width: number; height: number }) {
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border bg-background shadow-sm">
      <img
        src={`${MEDIA}/${name}.jpg`}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        className="block h-auto w-full"
      />
    </div>
  );
}

export default function LessonPlannerHowItWorksRoute() {
  const { stackV2, stackV3, share, runShow, templates, deckGallery, uploads } =
    useLoaderData<typeof loader>();
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
              <span className="text-primary">each class you teach.</span>
            </h1>
            <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
              Describe your lesson in your own words. The planner writes a timed
              plan with the slides, handouts, and exit ticket already made.
            </p>
          </div>
          <figure className="flex flex-col items-center gap-2">
            <div className="w-full rotate-1 rounded-2xl border bg-background p-2 shadow-lg">
              <QuoteSlide />
            </div>
            <figcaption className="text-xs text-muted-foreground">
              From a deck the planner built for an Of Mice and Men lesson
            </figcaption>
          </figure>
        </header>

        <section aria-labelledby="guide-start" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Eyebrow>Easy to start</Eyebrow>
            <H2 id="guide-start">Start with what you’re teaching</H2>
            <Copy>
              Open <strong className="text-foreground">Lesson Planner</strong>{' '}
              and there is one question on the page:{' '}
              <em>What are we teaching?</em> Type it in your own words, or start
              from one of the 13 starter tiles.
            </Copy>
            {templates ? (
              <Copy>
                Built a lesson shape you like? Start the next one from{' '}
                <strong className="text-foreground">Build from my templates</strong>{' '}
                (more on that below).
              </Copy>
            ) : null}
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
              When Yawp! summarizes how a class did on an assignment, each
              suggested next step gets a{' '}
              <strong className="text-foreground">Plan this lesson</strong>{' '}
              link. The planner opens with the message already written from that
              summary.
            </Copy>
          </Row>
        </section>

        <section aria-labelledby="guide-plan" className="flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <Eyebrow>The plan</Eyebrow>
            <H2 id="guide-plan">
              Tailor the lesson plan to your specific class
            </H2>
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
            {uploads ? (
              <Copy>
                <strong className="text-foreground">Bring your own material.</strong>{' '}
                The paperclip adds your documents: the chapter, last year’s
                handout, your notes (PDF, Word, PowerPoint or text). The planner
                builds from them, quotes them, and says which one each step uses.
                Only the text is kept.
              </Copy>
            ) : null}
          </Row>

          {stackV2 ? (
            <Row
              flip
              media={
                <Clip
                  name="plan-steps"
                  label="Scrolling a finished plan: numbered steps with their minutes, Add to stack on the hook, and three framing cards paged side by side with arrows."
                />
              }
            >
              <Step n={2}>Read the plan</Step>
              <H3>Every minute accounted for</H3>
              <Copy>
                Each step is its own numbered section with its time, and the
                steps add up to your period.
              </Copy>
              <Copy>
                Keep the whole plan, or tap{' '}
                <strong className="text-foreground">Add to stack</strong> on just
                the steps you want. When there are options, like three class
                starters or three exit tickets, they sit side by side: page
                through them with the arrows.
              </Copy>
            </Row>
          ) : (
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
          )}

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
            {stackV2 ? (
              <Copy>
                Every writing step has its own Create button. Once it’s made, the
                step says{' '}
                <strong className="text-foreground">Created in Yawp! · Open</strong>,
                in the chat and in your stack.
              </Copy>
            ) : null}
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
              makes a real deck, timed to the same period. Present it from Yawp!
              or download it as PowerPoint.
            </Copy>
            {deckGallery ? (
              <Copy>
                Decks are hung like a gallery: Georgia and Arial on warm paper,
                one painting chosen for the lesson and always credited, and two
                or three colors taken from it. A slide for each kind of moment,
                with a word over it only when the task changes, from{' '}
                <em>Today’s program</em> to <em>Write.</em> to{' '}
                <em>Before you go.</em> No lesson numbers, so you can reorder
                lessons. The same deck opens in PowerPoint and Google Slides.
              </Copy>
            ) : null}
          </div>
          <Row
            media={
              <Clip
                name="present"
                label="Presenting the lesson’s slide deck from Yawp!, with speaker notes opened beside a slide."
              />
            }
          >
            <H3>Speaker notes included</H3>
            <Copy>
              The notes provide your talking points, with the minutes for each
              slide.
            </Copy>
          </Row>
          {deckGallery ? (
            <Clip
              name="gallery-deck"
              label="Paging through a gallery deck for The Things They Carried in Georgia and Arial: a title slide with a Turner painting, Today’s program, a Write prompt on pine, a Talk question, a timeline in the painting’s colors, a Read along slide, a quick check with its answer marked, and Before you go on the rust accent wall."
            />
          ) : (
            <Clip
              name="deck"
              label="Tapping Build the slide deck for this lesson. A card appears with the deck’s thumbnails and Add to stack, PowerPoint and Present buttons."
            />
          )}
        </section>

        {stackV3 ? (
          <>
            <section aria-labelledby="guide-stack" className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <Eyebrow>The stack</Eyebrow>
                <H2 id="guide-stack">Your lesson, start to finish</H2>
                <Copy>
                  Tap <strong className="text-foreground">Add to stack</strong> on
                  the pieces you want. The stack is your run of show: every step
                  in order, with when it starts and how long it runs.
                </Copy>
              </div>
              <Clip
                name="run-of-show"
                label="On the stack page, adding minutes to the hook puts the lesson 5 minutes over; one of two suggested fixes is applied with Undo; then Ask the planner shortens the hook in one line."
              />
              <div className="grid gap-6 md:grid-cols-3">
                {[
                  {
                    title: 'Time against the period',
                    body: 'A bar shows every step against your class length. Run long and you get at most two fixes, each with Undo. Fixes never cut writing time.',
                  },
                  {
                    title: 'How much is writing',
                    body: 'A meter shows how much of class students spend writing: class starters, exit tickets, Daily Pages, thesis work and reflections, in Yawp! or on paper. It is the one number everywhere, on what you send too.',
                  },
                  {
                    title: 'Change it in a line',
                    body: 'Ask the planner: “shorten the hook to 10 minutes.” It makes the change, says so in one line, and offers Undo.',
                  },
                ].map((item) => (
                  <div key={item.title} className="flex flex-col gap-1.5 border-t-2 border-primary pt-3">
                    <H3>{item.title}</H3>
                    <Copy>{item.body}</Copy>
                  </div>
                ))}
              </div>
              <Row
                flip
                media={
                  <Still
                    name="take-to-class"
                    alt="Take it to class: the lesson plan as Word, Google Docs or PDF; the slide deck to present, edit or rebuild; and student handouts to print."
                    width={680}
                    height={1005}
                  />
                }
              >
                <Eyebrow>The finish line</Eyebrow>
                <H3>Set it, and take it to class</H3>
                <Copy>
                  When it looks right, tap{' '}
                  <strong className="text-foreground">This lesson is set</strong>.
                  Everything you need follows your order:
                </Copy>
                <Ticks
                  items={[
                    deckGallery
                      ? 'A lesson plan that matches the deck: its name, its color, its slides by step, as Word, Google Docs or PDF'
                      : 'A one-page timed lesson plan, as Word, Google Docs or PDF',
                    'The slide deck, built from your stack',
                    deckGallery
                      ? 'Handouts for any step, rewritten for students, in the plan’s fonts and color'
                      : 'Handouts for any step, rewritten for students, with room to write',
                  ]}
                />
              </Row>
              {share ? (
                <Row
                  media={
                    <Still
                      name="send-lesson"
                      alt="Send this lesson, with tabs for a substitute, a student, a family or an admin, and what each one gets."
                      width={680}
                      height={1260}
                    />
                  }
                >
                  <Eyebrow>Share it</Eyebrow>
                  <H3>Post it, or send it</H3>
                  <Copy>
                    <strong className="text-foreground">Post to your class</strong>{' '}
                    makes one link to a student page with the slides and handouts
                    you check. Copy it into Google Classroom, Canvas, Schoology or
                    wherever your students look.
                  </Copy>
                  <Copy>
                    <strong className="text-foreground">Send this lesson</strong>{' '}
                    rewrites it for whoever is reading: a sub plan with exact
                    times, a catch-up page for a student who missed class, what
                    the class did and why for a family (with ways to talk about
                    it at dinner), or the plan for an admin, with the standards
                    you named and an invitation to observe. Each gets an email
                    with a link; no login needed. A preview of Yawp! never sends
                    email and says so; copy the link to send it yourself.
                  </Copy>
                </Row>
              ) : null}
            </section>

            {runShow ? (
              <section aria-labelledby="guide-show" className="flex flex-col gap-8">
                <Row
                  media={
                    <Clip
                      name="run-the-show"
                      label="Setting the lesson, then Run the show: each step with its notes and the slide on the projector, a countdown for the step, and Next step."
                    />
                  }
                >
                  <Eyebrow>In class</Eyebrow>
                  <H2 id="guide-show">Run the show</H2>
                  <Copy>
                    Your view while you teach, on a laptop, tablet or phone: the
                    step you’re on, its notes, what’s next, and the slide on the
                    projector.
                  </Copy>
                  <Ticks
                    items={[
                      'Next step moves the slides on the projector with you.',
                      'A clock if you want one: stopwatch or countdown, off by default.',
                      'Running long is calm: a quiet note on your screen, never on the wall.',
                      'One screen, mirrored to the projector? Turn on “This screen is on the projector”: your notes and the clock hide, and the class sees the step and its slide.',
                    ]}
                  />
                </Row>
              </section>
            ) : null}

            {templates ? (
              <section aria-labelledby="guide-templates" className="flex flex-col gap-8">
                <Row
                  flip
                  media={
                    <Clip
                      name="templates"
                      label="Saving a set lesson as the template Read and write day, then starting a new lesson from it on the planner’s start page."
                    />
                  }
                >
                  <Eyebrow>Templates</Eyebrow>
                  <H2 id="guide-templates">Reuse a shape that works</H2>
                  <Copy>
                    Once a lesson is set,{' '}
                    <strong className="text-foreground">Save this shape as a template</strong>{' '}
                    keeps its order and timing, not its content. Next time, pick
                    it from <strong className="text-foreground">Build from my templates</strong>,
                    say what you’re reading, and the planner fills in the same
                    shape.
                  </Copy>
                </Row>
              </section>
            ) : null}
          </>
        ) : (
          <section aria-labelledby="guide-stack" className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <Eyebrow>The stack</Eyebrow>
              <H2 id="guide-stack">
                Everything for the lesson, in one place to print
              </H2>
              <Copy>
                Tap <strong className="text-foreground">Add to stack</strong> on
                the pieces you want to keep. The stack puts the plan, handouts,
                answer key, and deck in lesson order, ready to print or save as a
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
        )}

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
                {wontList(share).map((item) => (
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
