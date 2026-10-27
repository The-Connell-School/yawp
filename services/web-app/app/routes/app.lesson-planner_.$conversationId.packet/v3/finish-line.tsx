/**
 * The finish line (stack page redesign): "Ready for Monday?" and one button.
 * Set, it says when the lesson is for and what it took — the fun comes from
 * finishing — and offers Run the show, saving the shape, or keeping at it.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useFetcher } from 'react-router';
import { Check, MonitorPlay, NotebookText, Play } from 'lucide-react';
import type { StackStep } from '~/domain/lesson-planner/stack-steps';
import type { StackTiming } from '~/domain/lesson-planner/stack-timing';
import { READY_LINE, type BeforeClassItem } from '~/domain/lesson-planner/before-class';
import { plannedLabel } from '~/domain/lesson-planner/planned-time';
import { YawpChecklist } from './yawp-checklist';
import { HEADING_FONT } from './theme';
import { Celebration } from './celebration';

function weekday(iso: string | null): string {
  if (!iso) return 'class';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

function shortDate(iso: string | null): string {
  if (!iso) return 'class';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** What's left before class, ticking itself off (Kevin's note 12a). */
function BeforeClass({ list }: { list: { items: BeforeClassItem[]; ready: boolean } }) {
  return (
    <div data-testid="before-class" className="mt-4 rounded-xl border border-[var(--sv-line)] p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--sv-primary)]">
        {list.ready ? 'Ready to teach' : 'Before class'}
      </p>
      {list.ready ? <p data-testid="before-class-ready" className="mt-1 text-sm">{READY_LINE}</p> : null}
      <ul className="mt-2 space-y-1">
        {list.items.map((item) => (
          <li
            key={item.key}
            data-testid="before-class-item"
            data-done={item.done ? 'true' : 'false'}
            className={`flex items-center gap-2 text-sm ${item.done ? 'text-[var(--sv-muted)]' : ''}`}
          >
            <span
              aria-hidden
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                item.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-[var(--sv-line)]'
              }`}
            >
              {item.done ? <Check size={11} /> : null}
            </span>
            <span className={item.done ? 'line-through decoration-1' : ''}>{item.label}</span>
            <span className="sr-only">{item.done ? '(done)' : '(to do)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The finish line, and the celebration when the teacher sets the lesson
 * (Brian's round 5, item 11): only after their click, never when a lesson that
 * is already set is opened.
 */
export function FinishLine(props: Parameters<typeof FinishLineCard>[0]) {
  const clicked = useRef(false);
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (!props.setAt) return;
    if (clicked.current) setCelebrating(true);
    clicked.current = false;
  }, [props.setAt]);
  return (
    <div className="relative">
      {celebrating ? <Celebration onDone={() => setCelebrating(false)} /> : null}
      <FinishLineCard
        {...props}
        onSet={() => {
          clicked.current = true;
          props.onSet();
        }}
      />
    </div>
  );
}

function FinishLineCard({
  conversationId,
  timing,
  plannedMinutes = null,
  setAt,
  lessonDate,
  onSet,
  onKeepEditing,
  runShow,
  templates,
  onSaveTemplate,
  suggestedTemplateName,
  busy,
  missing = [],
  onPaper = () => {},
  teach = null,
  saveToUnit = null,
  beforeClass = null,
}: {
  conversationId: string;
  timing: StackTiming;
  /** Minutes actually spent on it (Brian's round 5, item 12). */
  plannedMinutes?: number | null;
  setAt: string | null;
  lessonDate: string | null;
  onSet: () => void;
  onKeepEditing: () => void;
  runShow: boolean;
  templates: boolean;
  onSaveTemplate: (name: string) => void;
  suggestedTemplateName: string;
  busy: boolean;
  /** Writing steps not made in Yawp! yet (and not on paper). */
  missing?: StackStep[];
  onPaper?: (id: string) => void;
  /**
   * Stack page v2 (Oct 24 handoff, task 6): two Teach it buttons in place of
   * Run the show. With no deck yet, Open slideshow builds one first.
   */
  teach?: { slideshowHref: string | null; notesHref: string; onBuildDeck: () => void } | null;
  /** The library redesign (Part 2, L3): a set lesson in no unit can be saved to one. */
  saveToUnit?: Array<{ id: string; title: string; course: string | null }> | null;
  /** The Before class list; null with it off. */
  beforeClass?: { items: BeforeClassItem[]; ready: boolean } | null;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(suggestedTemplateName);
  const [saved, setSaved] = useState(false);
  // Kept for the visit: once saved, the lesson is in a unit and the page no
  // longer offers it, but the teacher should still see where it went.
  const [unitChoices] = useState(saveToUnit);

  if (!setAt) {
    const line =
      timing.over > 0
        ? `${timing.over} min over. Fix it, or set it anyway.`
        : `${timing.status}. Set it and it's ready to teach.`;
    return (
      <section data-testid="finish-line" className="rounded-2xl border-2 border-[var(--sv-ink)] bg-[var(--sv-card)] p-5">
        <h2 className="text-xl font-bold" style={HEADING_FONT}>
          Ready for {weekday(lessonDate)}?
        </h2>
        <p data-testid="finish-status" className="mt-1 text-sm text-[var(--sv-muted)]">
          {line}
          {timing.writingMinutes ? ` ${timing.writingPercent}% writing.` : ''}
        </p>
        <YawpChecklist missing={missing} onPaper={onPaper} />
        {beforeClass ? <BeforeClass list={beforeClass} /> : null}
        <button
          type="button"
          data-testid="set-lesson"
          disabled={busy || timing.blocks.length === 0}
          onClick={onSet}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sv-ink)] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {/* Said before the click as what it does (Brian's round 5, item 11). */}
          <Check size={16} /> Set this lesson
        </button>
      </section>
    );
  }

  return (
    <section data-testid="lesson-set" className="rounded-2xl border-2 border-[var(--sv-ink)] bg-[var(--sv-card)] p-5">
      <h2 className="flex items-center gap-2 text-xl font-bold" style={HEADING_FONT}>
        <Check size={18} /> Lesson set for {shortDate(lessonDate)}
      </h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {/* Not class time (Kevin's note 12b): how long the planning took. */}
        {/* Real working time, not the clock (Brian's round 5, item 12). */}
        <div className="rounded-lg bg-[#F1EBE2] p-2" title="Time you spent working on this lesson, not counting time away">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sv-muted)]">Planned in</dt>
          <dd data-testid="stat-built" className="text-lg font-bold" style={HEADING_FONT}>
            {plannedLabel(plannedMinutes ?? 1)}
          </dd>
          <dd className="text-[10px] leading-tight text-[var(--sv-muted)]">of time working on it</dd>
        </div>
        <div className="rounded-lg bg-[#F1EBE2] p-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sv-muted)]">Class time</dt>
          <dd data-testid="stat-planned" className="text-lg font-bold" style={HEADING_FONT}>
            {timing.total} min
          </dd>
        </div>
        <div className="rounded-lg p-2" style={{ backgroundColor: 'var(--sv-writing-strip)' }}>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sv-muted)]">Writing</dt>
          <dd data-testid="stat-writing" className="text-lg font-bold" style={{ ...HEADING_FONT, color: 'var(--sv-writing)' }}>
            {timing.writingPercent}%
          </dd>
        </div>
      </dl>
      <YawpChecklist missing={missing} onPaper={onPaper} />
      {beforeClass ? <BeforeClass list={beforeClass} /> : null}
      {unitChoices ? <SaveToUnit conversationId={conversationId} units={unitChoices} /> : null}
      {teach ? (
        <div data-testid="teach-it" className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--sv-primary)]">Teach it</p>
          {teach.slideshowHref ? (
            <Link
              to={teach.slideshowHref}
              data-testid="open-slideshow"
              className="flex w-full items-center gap-3 rounded-xl bg-[var(--sv-primary)] px-4 py-3 text-left text-white transition hover:opacity-90"
            >
              <MonitorPlay size={18} className="shrink-0" />
              <span>
                <span className="block text-sm font-bold">Open slideshow</span>
                <span className="block text-xs text-white/80">For the smartboard or projector</span>
              </span>
            </Link>
          ) : (
            <button
              type="button"
              data-testid="open-slideshow"
              onClick={teach.onBuildDeck}
              className="flex w-full items-center gap-3 rounded-xl bg-[var(--sv-primary)] px-4 py-3 text-left text-white transition hover:opacity-90"
            >
              <MonitorPlay size={18} className="shrink-0" />
              <span>
                <span className="block text-sm font-bold">Open slideshow</span>
                <span className="block text-xs text-white/80">No deck yet: build it first, right here</span>
              </span>
            </button>
          )}
          <Link
            to={teach.notesHref}
            data-testid="run-of-show-notes"
            className="mt-2 flex w-full items-center gap-3 rounded-xl border-2 border-[var(--sv-ink)] px-4 py-3 text-left transition hover:bg-[#F1EBE2]"
          >
            <NotebookText size={18} className="shrink-0" />
            <span>
              <span className="block text-sm font-bold">Run of show with teacher notes</span>
              <span className="block text-xs text-[var(--sv-muted)]">For your laptop at the podium</span>
            </span>
          </Link>
        </div>
      ) : runShow ? (
        <Link
          to={`/show/${conversationId}?from=stack`}
          data-testid="run-the-show"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sv-primary)] py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <Play size={15} /> Run the show
        </Link>
      ) : null}
      {templates ? (
        naming ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              onSaveTemplate(name.trim());
              setNaming(false);
              setSaved(true);
            }}
          >
            <label className="sr-only" htmlFor="template-name">
              Template name
            </label>
            <input
              id="template-name"
              data-testid="template-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-[var(--sv-line)] px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-[var(--sv-ink)] px-3 text-sm font-semibold text-white">
              Save
            </button>
          </form>
        ) : (
          <button
            type="button"
            data-testid="save-template"
            onClick={() => setNaming(true)}
            className="mt-3 w-full rounded-xl border border-[var(--sv-line)] py-2.5 text-sm font-semibold transition hover:bg-[#F1EBE2]"
          >
            {saved ? 'Saved as a template ✓' : 'Save this shape as a template'}
          </button>
        )
      ) : null}
      {templates && naming ? (
        <p className="mt-1 text-xs text-[var(--sv-muted)]">Saves the order and timing, not the content.</p>
      ) : null}
      <button
        type="button"
        data-testid="keep-editing"
        disabled={busy}
        onClick={onKeepEditing}
        className="mt-2 w-full py-2 text-sm font-semibold text-[var(--sv-muted)] underline-offset-2 hover:underline"
      >
        Keep editing
      </button>
    </section>
  );
}

/**
 * Save to unit (Oct 24 handoff, Part 2, L3): a lesson planned first, or one
 * whose place was "decide when I set it", is filed in a unit here.
 */
function SaveToUnit({ conversationId, units }: { conversationId: string; units: Array<{ id: string; title: string; course: string | null }> }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  if (fetcher.data?.ok) {
    return (
      <p data-testid="saved-to-unit" className="mt-4 rounded-xl bg-[#F1EBE2] px-3 py-2 text-sm">
        {fetcher.data.message}
      </p>
    );
  }
  return (
    <div data-testid="save-to-unit" className="mt-4 rounded-xl border border-[var(--sv-line)] p-3">
      <p className="text-sm font-semibold">Save to unit</p>
      {units.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            aria-label="Unit"
            data-testid="save-to-unit-select"
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[var(--sv-line)] bg-white px-2 py-2 text-sm"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.course ? `${unit.course} · ` : ''}
                {unit.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="save-to-unit-save"
            disabled={!unitId || fetcher.state !== 'idle'}
            onClick={() =>
              fetcher.submit({ intent: 'move-lesson', conversationId, unitId }, { method: 'post', action: '/api/domain/lesson-planner/library' })
            }
            className="rounded-lg bg-[var(--sv-ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
      ) : (
        <p className="mt-1 text-xs text-[var(--sv-muted)]">
          It stays under Lessons on their own. Make a unit in your <a className="underline" href="/app/lesson-planner/library">library</a> to file it.
        </p>
      )}
      {fetcher.data?.error ? <p className="mt-1 text-xs text-red-700">{fetcher.data.error}</p> : null}
    </div>
  );
}
