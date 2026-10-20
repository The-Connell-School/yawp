/**
 * The finish line (stack page redesign): "Ready for Monday?" and one button.
 * Set, it says when the lesson is for and what it took — the fun comes from
 * finishing — and offers Run the show, saving the shape, or keeping at it.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { Check, Play } from 'lucide-react';
import type { StackTiming } from '~/domain/lesson-planner/stack-timing';
import { HEADING_FONT } from './theme';

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

/** How long the lesson took to build: creation to set. */
export function builtIn(createdAt: string, setAt: string): string {
  const minutes = Math.max(1, Math.round((Date.parse(setAt) - Date.parse(createdAt)) / 60_000));
  if (minutes < 120) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} hr` : `${Math.round(hours / 24)} days`;
}

export function FinishLine({
  conversationId,
  timing,
  createdAt,
  setAt,
  lessonDate,
  onSet,
  onKeepEditing,
  runShow,
  templates,
  onSaveTemplate,
  suggestedTemplateName,
  busy,
}: {
  conversationId: string;
  timing: StackTiming;
  createdAt: string;
  setAt: string | null;
  lessonDate: string | null;
  onSet: () => void;
  onKeepEditing: () => void;
  runShow: boolean;
  templates: boolean;
  onSaveTemplate: (name: string) => void;
  suggestedTemplateName: string;
  busy: boolean;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(suggestedTemplateName);
  const [saved, setSaved] = useState(false);

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
        <button
          type="button"
          data-testid="set-lesson"
          disabled={busy || timing.blocks.length === 0}
          onClick={onSet}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sv-ink)] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Check size={16} /> This lesson is set
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
        <div className="rounded-lg bg-[#F1EBE2] p-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sv-muted)]">Built in</dt>
          <dd data-testid="stat-built" className="text-lg font-bold" style={HEADING_FONT}>
            {builtIn(createdAt, setAt)}
          </dd>
        </div>
        <div className="rounded-lg bg-[#F1EBE2] p-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sv-muted)]">Planned</dt>
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
      {runShow ? (
        <Link
          to={`/app/lesson-planner/${conversationId}/show`}
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
