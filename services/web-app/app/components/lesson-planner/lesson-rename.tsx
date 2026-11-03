/**
 * Rename a lesson in place (Oct 24 handoff, task 8): a Rename pill (or a
 * pencil on a card) → an inline input with Save and Cancel, and "Started as
 * …" under it. The stack page and the library use this one control, so a
 * rename in either is the name in both.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useFetcher } from 'react-router';
import { Pencil } from 'lucide-react';
import { cn } from '~/utils/misc';
import { MAX_LESSON_NAME, startedAsHint } from '~/domain/lesson-planner/lesson-rename';

const STACK_API = '/api/domain/lesson-planner/stack';

export function LessonRename({
  conversationId,
  title,
  originalTitle,
  variant = 'heading',
  children,
}: {
  conversationId: string;
  title: string;
  originalTitle: string | null;
  /** heading: a "Rename" pill beside the page title; card: a pencil. */
  variant?: 'heading' | 'card';
  /** The title as shown when not renaming. */
  children: ReactNode;
}) {
  const fetcher = useFetcher<{ ok?: boolean; title?: string; error?: string }>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) setEditing(false);
  }, [fetcher.state, fetcher.data]);

  if (!editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {children}
        <button
          type="button"
          data-testid="lesson-rename"
          aria-label={`Rename ${title}`}
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 text-[var(--sv-muted,#6B6259)] transition hover:text-[var(--sv-ink,#1C1A17)]',
            variant === 'heading' &&
              'rounded-full border border-[var(--sv-line,#E4DCCF)] bg-[var(--sv-card,#FFFDF9)] px-3 py-1 text-xs font-semibold'
          )}
        >
          <Pencil size={variant === 'heading' ? 12 : 14} />
          {variant === 'heading' ? 'Rename' : null}
        </button>
      </span>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action={STACK_API}
      data-testid="lesson-rename-form"
      className="w-full rounded-xl border border-[var(--sv-primary,#B4462E)] bg-[var(--sv-card,#FFFDF9)] p-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setEditing(false);
      }}
    >
      <input type="hidden" name="intent" value="rename-lesson" />
      <input type="hidden" name="conversationId" value={conversationId} />
      <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--sv-muted,#6B6259)]" htmlFor={`rename-${conversationId}`}>
        Lesson name
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          id={`rename-${conversationId}`}
          name="title"
          data-testid="lesson-rename-input"
          autoFocus
          required
          maxLength={MAX_LESSON_NAME}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          className="min-w-0 flex-1 rounded-lg border border-[var(--sv-ink,#1C1A17)] bg-white px-3 py-2 text-base font-semibold"
        />
        <button
          type="submit"
          data-testid="lesson-rename-save"
          disabled={!draft.trim() || fetcher.state !== 'idle'}
          className="rounded-lg bg-[var(--sv-ink,#1C1A17)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          data-testid="lesson-rename-cancel"
          onClick={() => setEditing(false)}
          className="rounded-lg border border-[var(--sv-line,#E4DCCF)] px-4 py-2 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
      <p data-testid="lesson-rename-hint" className="mt-1.5 text-xs text-[var(--sv-muted,#6B6259)]">
        {startedAsHint(originalTitle ?? title)}
      </p>
      {fetcher.data?.error ? <p className="mt-1 text-xs text-red-700">{fetcher.data.error}</p> : null}
    </fetcher.Form>
  );
}
