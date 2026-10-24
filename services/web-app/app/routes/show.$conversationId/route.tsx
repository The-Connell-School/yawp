/**
 * Run the show (stack page redesign): the teacher's view during class, on a
 * laptop, tablet or phone, while the slides play on the projector. Dark, so
 * it does not glare. The clock is off unless the teacher wants it, and
 * running long is calm: amber, "past the plan. No rush."
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, redirect, useLoaderData, useLocation, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { closeHref } from '~/domain/lesson-planner/lesson-return';
import { ArrowRight, Check, ChevronLeft, MonitorPlay } from 'lucide-react';
import { prisma } from '~/utils/db.server';
import { loadStackV3 } from '~/domain/lesson-planner/load-stack-v3.server';
import { readSlideDeck } from '~/domain/lesson-planner/slide-deck';
import { clockText, countdown, slideForStep, type ClockMode } from '~/domain/lesson-planner/run-show';
import { STEP_TYPE_COLORS, stepChipText } from '~/domain/lesson-planner/step-types';
import { useShowChannel } from '~/components/lesson-planner/show-channel';
import { TileSlideCanvas } from '../present.$conversationId.$messageId/tile-slide-canvas';
import { GALLERY_FONTS_HREF, GallerySlideCanvas } from '../present.$conversationId.$messageId/gallery-slide-canvas';
import { HEADING_FONT, STACK_FONTS_HREF, typeChipStyle } from '../app.lesson-planner_.$conversationId.packet/v3/theme';
import { cn } from '~/utils/misc';

export const meta: MetaFunction = () => [{ title: 'Run the show · Yawp!' }];

export async function loader({ request, params }: LoaderFunctionArgs) {
  const loaded = await loadStackV3({ request, conversationId: params.conversationId });
  if (!loaded) throw redirect(`/app/lesson-planner/${params.conversationId}/packet`);
  if (!loaded.reviewFlags.runShow) throw new Response('Not Found', { status: 404 });
  const deckRow = loaded.v3.deck
    ? await prisma.lessonPlanMaterial.findFirst({
        where: { id: loaded.v3.deck.id, conversationId: loaded.conversationId },
        select: { id: true, content: true },
      })
    : null;
  const deck = deckRow ? readSlideDeck(deckRow.content) : null;
  return {
    conversationId: loaded.conversationId,
    title: loaded.packet.title,
    className: loaded.packet.className,
    periodMinutes: loaded.periodMinutes,
    blocks: loaded.v3.timing.blocks,
    notes: Object.fromEntries(loaded.v3.steps.map((step) => [step.id, step.excerpt])),
    labels: Object.fromEntries(loaded.v3.steps.map((step) => [step.id, step.label])),
    deck: deck?.kind === 'deck' ? { id: deckRow!.id, ...deck.deck } : null,
    gallery: loaded.reviewFlags.deckGallery,
  };
}

const CLOCK_KEY = 'yawp-show-clock';
const ROOM_KEY = 'yawp-show-room';

function readClock(): ClockMode {
  try {
    const saved = window.localStorage.getItem(CLOCK_KEY);
    return saved === 'stopwatch' || saved === 'countdown' ? saved : 'off';
  } catch {
    return 'off';
  }
}

export default function RunTheShowRoute() {
  const { conversationId, title, className, periodMinutes, blocks, notes, labels, deck, gallery } =
    useLoaderData<typeof loader>();
  const location = useLocation();
  const backTo = closeHref(conversationId, location.search, 'stack');
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState(false);
  const [clock, setClock] = useState<ClockMode>('off');
  const [headsUpOn, setHeadsUpOn] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [classStart, setClassStart] = useState(() => Date.now());
  const [stepStart, setStepStart] = useState(() => Date.now());
  const [projector, setProjector] = useState(false);
  // A teacher who mirrors this screen to the projector (one screen, no
  // second display) hides what is theirs: notes, the clock, the times
  // (Brian's run 4). Students then see the step and its slide.
  const [roomView, setRoomView] = useState(false);
  useEffect(() => setClock(readClock()), []);
  useEffect(() => {
    try {
      setRoomView(window.localStorage.getItem(ROOM_KEY) === 'on');
    } catch {
      // Off.
    }
  }, []);
  function chooseRoomView(on: boolean) {
    setRoomView(on);
    try {
      window.localStorage.setItem(ROOM_KEY, on ? 'on' : 'off');
    } catch {
      // Remembered for this visit only.
    }
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const tell = useShowChannel(conversationId, (message) => {
    if (message.type === 'projector-here') setProjector(true);
  });
  useEffect(() => {
    tell({ type: 'ping' });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slideIndex = useMemo(
    () => slideForStep(deck ? { slides: deck.slides } : null, current, blocks),
    [deck, current, blocks]
  );
  useEffect(() => {
    if (slideIndex != null) tell({ type: 'slide', index: slideIndex });
    // Next moves the slides too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideIndex]);

  const step = blocks[current];
  const next = blocks[current + 1];
  const inStep = (now - stepStart) / 1000;
  const inClass = (now - classStart) / 1000;
  const timer = step ? countdown(inStep, step.minutes) : null;

  function go(index: number) {
    if (index >= blocks.length) {
      setDone(true);
      return;
    }
    setDone(false);
    setCurrent(Math.max(0, index));
    setStepStart(Date.now());
  }

  function chooseClock(mode: ClockMode) {
    setClock(mode);
    try {
      window.localStorage.setItem(CLOCK_KEY, mode);
    } catch {
      // Remembered for this visit only.
    }
  }

  const subtitle = [className, periodMinutes ? `${periodMinutes} min` : null].filter(Boolean).join(' · ');

  return (
    <div
      data-testid="run-show"
      className="flex min-h-screen flex-col text-[#F3EDE4]"
      style={{ backgroundColor: '#1C1A17', fontFamily: "'Instrument Sans', ui-sans-serif, system-ui, sans-serif" }}
    >
      <link rel="stylesheet" href={STACK_FONTS_HREF} />
      {gallery ? <link rel="stylesheet" href={GALLERY_FONTS_HREF} /> : null}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-4">
          <Link
            to={backTo}
            className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-sm font-semibold"
          >
            <ChevronLeft size={15} /> Exit show
          </Link>
          <div>
            <p className="font-semibold" style={HEADING_FONT}>
              {title}
            </p>
            {subtitle ? <p className="text-xs text-white/60">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="room-view"
            aria-pressed={roomView}
            onClick={() => chooseRoomView(!roomView)}
            title="For a laptop screen mirrored to the projector: hides your notes and the clock"
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold',
              roomView ? 'border-[#F3EDE4] bg-[#F3EDE4] text-[#1C1A17]' : 'border-white/20'
            )}
          >
            {roomView ? 'Showing the class view · show my notes' : 'This screen is on the projector'}
          </button>
          <div role="radiogroup" aria-label="Clock" hidden={roomView} className="flex items-center gap-1 rounded-xl bg-[#2A2622] p-1 text-sm">
            <span className="px-2 text-xs text-white/60">Clock</span>
            {(['off', 'stopwatch', 'countdown'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={clock === mode}
                data-testid={`clock-${mode}`}
                onClick={() => chooseClock(mode)}
                className={cn('rounded-lg px-3 py-1 font-semibold capitalize', clock === mode ? 'bg-[#F3EDE4] text-[#1C1A17]' : 'text-white/80')}
              >
                {mode}
              </button>
            ))}
          </div>
          {deck ? (
            projector ? (
              <span data-testid="projector-following" className="inline-flex items-center gap-2 rounded-full bg-[#2A2622] px-3 py-1.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-[#3E9A84]" /> Slides on the projector · following you
              </span>
            ) : (
              <a
                href={`/present/${conversationId}/${deck.id}?from=show`}
                target="yawp-projector"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold"
              >
                <MonitorPlay size={13} /> Open the slides on the projector
              </a>
            )
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-8 lg:flex-row">
        <nav aria-label="Run of show" className="lg:w-72 lg:shrink-0">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/60">Run of show</p>
          <ol className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {blocks.map((block, index) => {
              const state = done || index < current ? 'done' : index === current ? 'now' : 'next';
              return (
                <li key={block.id}>
                  <button
                    type="button"
                    data-testid="show-rail-step"
                    data-state={state}
                    onClick={() => go(index)}
                    className={cn(
                      'flex w-56 items-start gap-3 rounded-xl px-3 py-2 text-left lg:w-full',
                      state === 'now' ? 'bg-[#2A2622]' : 'hover:bg-white/5',
                      state === 'done' && 'opacity-60'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                        state === 'now' ? 'border-[#D9714F] bg-[#D9714F] text-white' : 'border-white/30'
                      )}
                    >
                      {state === 'done' ? <Check size={12} /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold" style={{ color: STEP_TYPE_COLORS[block.type].accent }}>
                        {stepChipText(block.type, labels[block.id])}
                      </span>
                      <span className="block text-sm leading-snug">{block.title}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-white/60">
                      {block.isWriting ? <span aria-label="Writing" className="h-1.5 w-1.5 rounded-full bg-[#9B74CF]" /> : null}
                      {roomView ? null : `${block.minutes}′`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {done ? (
            <section data-testid="show-done" className="flex flex-1 flex-col items-center justify-center rounded-3xl bg-[#F3EDE4] p-10 text-center text-[#1C1A17]">
              <h1 className="text-5xl font-extrabold" style={HEADING_FONT}>
                That’s the show.
              </h1>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  to={backTo}
                  className="rounded-xl border border-[#1C1A17]/20 px-5 py-3 font-semibold"
                >
                  Back to your lesson
                </Link>
                <button
                  type="button"
                  data-testid="run-again"
                  onClick={() => {
                    setClassStart(Date.now());
                    go(0);
                  }}
                  className="rounded-xl bg-[#D9714F] px-5 py-3 font-semibold text-white"
                >
                  Run it again{className ? ' for the next period' : ''}
                </button>
              </div>
            </section>
          ) : step ? (
            <section data-testid="show-now" className="flex flex-1 flex-col rounded-3xl bg-[#F3EDE4] p-6 text-[#1C1A17] sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#A8482A]">
                  Now · Step {current + 1} of {blocks.length}
                </p>
                <div className="text-right text-sm text-[#45403A]" data-testid="show-clock" hidden={roomView}>
                  {clock === 'off' ? (
                    <span>Planned: {step.minutes} min</span>
                  ) : clock === 'stopwatch' ? (
                    <span>
                      <strong className="text-2xl tabular-nums">{clockText(inStep)}</strong> in this step ·{' '}
                      {clockText(inClass)} into class
                    </span>
                  ) : timer && timer.over > 0 ? (
                    <span data-testid="show-overtime" className="font-semibold text-amber-700">
                      {clockText(timer.over)} past the plan. No rush.
                    </span>
                  ) : (
                    <span>
                      <strong className="text-2xl tabular-nums">{clockText(timer?.left ?? 0)}</strong> left
                    </span>
                  )}
                </div>
              </div>
              {clock === 'countdown' && timer && !roomView ? (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E6E2DC]">
                  <div
                    className={cn('h-full rounded-full', timer.over > 0 ? 'bg-amber-500' : 'bg-[#3E9A84]')}
                    style={{ width: `${timer.progress * 100}%` }}
                  />
                </div>
              ) : null}
              {clock === 'countdown' && headsUpOn && timer?.headsUp && !roomView ? (
                <p data-testid="show-heads-up" className="mt-2 text-sm text-amber-800">
                  Two minutes left in this step.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={typeChipStyle(step.type)}>
                  {stepChipText(step.type, labels[step.id])}
                </span>
                {step.isWriting ? (
                  <span className="rounded-full bg-[#7B4FB0] px-2.5 py-0.5 text-xs font-semibold text-white">Writing</span>
                ) : null}
              </div>
              <h1 data-testid="show-title" className="mt-2 text-4xl font-extrabold leading-tight sm:text-5xl" style={HEADING_FONT}>
                {step.title}
              </h1>
              <div className="mt-5 flex flex-1 flex-col gap-6 md:flex-row">
                {roomView ? null : (
                  <p data-testid="show-notes" className="flex-1 text-lg leading-relaxed text-[#45403A] sm:text-xl">
                    {notes[step.id]}
                  </p>
                )}
                {deck && slideIndex != null ? (
                  <figure className={cn('w-full shrink-0', roomView ? 'mx-auto max-w-4xl' : 'md:w-72')}>
                    <div className="aspect-video overflow-hidden rounded-xl bg-[#1C1A17]">
                      {gallery ? (
                        <GallerySlideCanvas deck={deck} index={slideIndex} />
                      ) : (
                        <TileSlideCanvas slide={deck.slides[slideIndex]!} />
                      )}
                    </div>
                    <figcaption className="mt-1 text-xs text-[#6E665C]" hidden={roomView}>
                      On the projector now · slide {slideIndex + 1}
                    </figcaption>
                  </figure>
                ) : null}
              </div>
              {clock === 'countdown' && !roomView ? (
                <label className="mt-4 flex items-center gap-2 text-xs text-[#6E665C]">
                  <input type="checkbox" checked={headsUpOn} onChange={() => setHeadsUpOn(!headsUpOn)} />
                  Heads-up at 2 minutes left, on this screen only
                </label>
              ) : null}
            </section>
          ) : (
            <p>Nothing in this lesson yet.</p>
          )}

          {!done ? (
            <div className="flex flex-wrap items-stretch gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-[#2A2622] px-5 py-3">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">Up next</span>
                <span className="truncate font-semibold">{next ? next.title : 'The end'}</span>
                {next && !roomView ? <span className="text-xs text-white/60">{next.minutes} min</span> : null}
              </div>
              <button
                type="button"
                disabled={current === 0}
                onClick={() => go(current - 1)}
                className="rounded-2xl border border-white/20 px-6 py-3 font-semibold disabled:opacity-40"
              >
                Back
              </button>
              <button
                type="button"
                data-testid="show-next"
                onClick={() => go(current + 1)}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#D9714F] px-6 py-3 text-lg font-semibold text-[#1C1A17]"
              >
                Next step <ArrowRight size={18} />
              </button>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
