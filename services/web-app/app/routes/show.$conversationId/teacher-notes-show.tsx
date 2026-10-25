/**
 * Run of show with teacher notes (Oct 24 handoff, task 7, screen B): the
 * teacher's laptop at the podium while the slideshow runs on the smartboard.
 * Every step on the left; the step now, its slide and its notes in full,
 * which the teacher can edit. The clock is off unless they want it. Nothing
 * here moves the slides: the slideshow is driven on its own.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useFetcher } from 'react-router';
import { ArrowRight, Check, ChevronLeft, Pencil } from 'lucide-react';
import { clockText, countdown, type ClockMode } from '~/domain/lesson-planner/run-show';
import { noteSections } from '~/domain/lesson-planner/teacher-notes';
import { STEP_TYPE_COLORS, stepChipText, type StepType } from '~/domain/lesson-planner/step-types';
import type { SlideDeck } from '~/domain/lesson-planner/slide-deck';
import { TileSlideCanvas } from '../present.$conversationId.$messageId/tile-slide-canvas';
import { GALLERY_FONTS_HREF, GallerySlideCanvas } from '../present.$conversationId.$messageId/gallery-slide-canvas';
import { HEADING_FONT, STACK_FONTS_HREF, typeChipStyle } from '../app.lesson-planner_.$conversationId.packet/v3/theme';
import { cn } from '~/utils/misc';

const STACK_API = '/api/domain/lesson-planner/stack';
const SAVE_AFTER_MS = 600;

export type NotesShowStep = {
  id: string;
  title: string;
  type: StepType;
  minutes: number;
  isWriting: boolean;
  label: string | null;
  /** The deck slide for this step, if any. */
  slide: number | null;
};

export function TeacherNotesShow({
  conversationId,
  title,
  totalMinutes,
  steps,
  notes: initialNotes,
  pending = [],
  deck,
  gallery,
  backTo,
}: {
  conversationId: string;
  title: string;
  totalMinutes: number;
  steps: NotesShowStep[];
  notes: Record<string, string>;
  /** Steps whose notes are still being written; they arrive in the background. */
  pending?: string[];
  deck: (SlideDeck & { id: string }) | null;
  gallery: boolean;
  backTo: string;
}) {
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState(false);
  const [clock, setClock] = useState<ClockMode>('off');
  const [now, setNow] = useState(() => Date.now());
  const [stepStart, setStepStart] = useState(() => Date.now());
  const [notes, setNotes] = useState(initialNotes);
  const [editing, setEditing] = useState(false);
  const fetcher = useFetcher();
  const pendingSave = useRef<{ stepId: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Notes not written yet are asked for once, after the page is up (note 12c),
  // and land on every step the teacher hasn't started editing.
  const writer = useFetcher<{ ok?: boolean; notes?: Record<string, string> }>();
  const touched = useRef(new Set<string>());
  const [writing, setWriting] = useState(pending.length > 0);
  useEffect(() => {
    if (!pending.length) return;
    writer.submit({ intent: 'write-notes', conversationId }, { method: 'post', action: STACK_API });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (writer.state !== 'idle' || !writing || writer.data === undefined) return;
    setWriting(false);
    const written = writer.data.notes;
    if (!written) return;
    setNotes((all) => {
      const next = { ...all };
      for (const id of pending) if (written[id] && !touched.current.has(id)) next[id] = written[id]!;
      return next;
    });
  }, [writer.state, writer.data, writing, pending]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const save = pendingSave.current;
    pendingSave.current = null;
    if (!save) return;
    fetcher.submit(
      { intent: 'set-notes', conversationId, stepId: save.stepId, notes: save.text },
      { method: 'post', action: STACK_API }
    );
  }

  function edit(stepId: string, text: string) {
    touched.current.add(stepId);
    setNotes((all) => ({ ...all, [stepId]: text }));
    pendingSave.current = { stepId, text };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_AFTER_MS);
  }

  function go(index: number) {
    flush();
    setEditing(false);
    if (index >= steps.length) {
      setDone(true);
      return;
    }
    setDone(false);
    setCurrent(Math.max(0, index));
    setStepStart(Date.now());
  }

  const step = steps[current];
  const next = steps[current + 1];
  const inStep = (now - stepStart) / 1000;
  const left = step ? countdown(inStep, step.minutes) : null;
  const stepNotes = step ? (notes[step.id] ?? '') : '';
  const saving = fetcher.state !== 'idle' || pendingSave.current !== null;

  return (
    <div
      data-testid="run-show"
      data-mode="teacher-notes"
      className="flex min-h-screen flex-col text-[#F3EDE4]"
      style={{ backgroundColor: '#1C1A17', fontFamily: "'Instrument Sans', ui-sans-serif, system-ui, sans-serif" }}
    >
      <link rel="stylesheet" href={STACK_FONTS_HREF} />
      {gallery ? <link rel="stylesheet" href={GALLERY_FONTS_HREF} /> : null}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-4">
          <Link
            to={backTo}
            onClick={flush}
            data-testid="show-back"
            className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-sm font-semibold"
          >
            <ChevronLeft size={15} /> Back to the stack
          </Link>
          <div>
            <p className="font-semibold" style={HEADING_FONT}>
              {title}
            </p>
            <p data-testid="show-subtitle" className="text-xs text-white/60">
              Run of show with teacher notes · {totalMinutes} min
            </p>
          </div>
        </div>
        <div role="radiogroup" aria-label="Clock" className="flex items-center gap-1 rounded-xl bg-[#2A2622] p-1 text-sm">
          <span className="px-2 text-xs text-white/60">Clock</span>
          {(['off', 'stopwatch', 'countdown'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={clock === mode}
              data-testid={`clock-${mode}`}
              onClick={() => {
                setClock(mode);
                setStepStart(Date.now());
              }}
              className={cn('rounded-lg px-3 py-1 font-semibold capitalize', clock === mode ? 'bg-[#F3EDE4] text-[#1C1A17]' : 'text-white/80')}
            >
              {mode}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-8 lg:flex-row">
        <nav aria-label="Run of show" className="lg:w-72 lg:shrink-0">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/60">Run of show</p>
          <ol className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {steps.map((block, index) => {
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
                        {stepChipText(block.type, block.label)}
                      </span>
                      <span className="block text-sm leading-snug">{block.title}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-white/60">
                      {block.isWriting ? <span aria-label="Writing" className="h-1.5 w-1.5 rounded-full bg-[#9B74CF]" /> : null}
                      {block.minutes}′
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
                <Link to={backTo} className="rounded-xl border border-[#1C1A17]/20 px-5 py-3 font-semibold">
                  Back to the stack
                </Link>
                <button type="button" data-testid="run-again" onClick={() => go(0)} className="rounded-xl bg-[#D9714F] px-5 py-3 font-semibold text-white">
                  Run it again
                </button>
              </div>
            </section>
          ) : step ? (
            <section data-testid="show-now" className="flex flex-1 flex-col rounded-3xl bg-[#F3EDE4] p-6 text-[#1C1A17] sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <p data-testid="show-step-of" className="text-sm font-bold uppercase tracking-[0.14em] text-[#A8482A]">
                  Now · Step {current + 1} of {steps.length} · {step.minutes} min
                </p>
                {clock === 'off' ? null : (
                  <div className="text-right text-sm text-[#45403A]" data-testid="show-clock">
                    {clock === 'stopwatch' ? (
                      <span>
                        <strong className="text-2xl tabular-nums">{clockText(inStep)}</strong> in this step
                      </span>
                    ) : left && left.over > 0 ? (
                      <span data-testid="show-overtime" className="font-semibold text-amber-700">
                        +{clockText(left.over)} · past the plan. No rush.
                      </span>
                    ) : (
                      <span>
                        <strong className="text-2xl tabular-nums">{clockText(left?.left ?? 0)}</strong> left
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={typeChipStyle(step.type)}>
                  {stepChipText(step.type, step.label)}
                </span>
                {step.isWriting ? (
                  <span className="rounded-full bg-[#7B4FB0] px-2.5 py-0.5 text-xs font-semibold text-white">Writing</span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-col gap-6 md:flex-row md:items-start">
                <h1 data-testid="show-title" className="flex-1 text-4xl font-extrabold leading-tight sm:text-5xl" style={HEADING_FONT}>
                  {step.title}
                </h1>
                {deck && step.slide != null && deck.slides[step.slide] ? (
                  <figure data-testid="show-slide" className="w-full shrink-0 md:w-64">
                    <div className="aspect-video overflow-hidden rounded-xl bg-[#1C1A17]">
                      {gallery ? <GallerySlideCanvas deck={deck} index={step.slide} /> : <TileSlideCanvas slide={deck.slides[step.slide]!} />}
                    </div>
                    <figcaption className="mt-1 text-xs text-[#6E665C]">Slide for this step</figcaption>
                  </figure>
                ) : null}
              </div>

              <div className="mt-6 border-t border-[#1C1A17]/10 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6E665C]">
                    Teacher notes
                    {writing && step && pending.includes(step.id) && !touched.current.has(step.id) ? (
                      <span data-testid="notes-writing" className="ml-2 font-normal normal-case tracking-normal">
                        · Writing your notes…
                      </span>
                    ) : null}
                  </p>
                  <div className="flex items-center gap-3">
                    {editing ? (
                      <span data-testid="notes-saved" className="text-xs text-[#6E665C]">
                        {saving ? 'Saving…' : 'Saved'}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      data-testid={editing ? 'notes-done' : 'notes-edit'}
                      onClick={() => {
                        if (editing) flush();
                        setEditing(!editing);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#1C1A17]/20 px-3 py-1 text-xs font-semibold"
                    >
                      {editing ? (
                        'Done'
                      ) : (
                        <>
                          <Pencil size={12} /> Edit notes
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {editing ? (
                  <textarea
                    data-testid="notes-input"
                    aria-label={`Teacher notes for ${step.title}`}
                    autoFocus
                    value={stepNotes}
                    onChange={(event) => edit(step.id, event.target.value)}
                    rows={Math.max(8, stepNotes.split('\n').length + 2)}
                    className="mt-3 w-full rounded-xl border border-[#1C1A17]/30 bg-white p-4 text-base leading-relaxed"
                  />
                ) : (
                  <dl data-testid="show-notes" className="mt-3 space-y-4 text-lg leading-relaxed text-[#2E2A25]">
                    {noteSections(stepNotes).map((section, index) => (
                      <div key={index} data-testid="notes-section">
                        {section.heading ? (
                          <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[#A8482A]">{section.heading}</dt>
                        ) : null}
                        <dd className="whitespace-pre-line">{section.body}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </section>
          ) : (
            <p>Nothing in this lesson yet.</p>
          )}

          {!done ? (
            <div className="flex flex-wrap items-stretch gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-[#2A2622] px-5 py-3">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">Up next</span>
                <span data-testid="show-up-next" className="truncate font-semibold">
                  {next ? next.title : 'The end'}
                </span>
                {next ? <span className="text-xs text-white/60">{next.minutes} min</span> : null}
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
