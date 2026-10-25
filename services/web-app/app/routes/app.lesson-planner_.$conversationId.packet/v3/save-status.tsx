/**
 * Where the lesson is saved, and one way to keep it (Brian's round 4, item 7).
 *
 * Every change on the stack is saved the moment it is made. What a teacher
 * couldn't tell was where: the status now names the place ("Saved to English
 * 10 › Age of Reason/Enlightenment · 2 min ago") and links there. One library
 * control replaces the look-alike pair: Save to library, which files a lesson
 * on its own in a unit or keeps it on its own, or In your library ✓, which
 * opens where it lives. Leaving with a change still on its way asks first.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useFetcher } from 'react-router';
import { BookMarked, Check, ChevronDown } from 'lucide-react';
import { savedLine, type LessonLocation } from '~/domain/lesson-planner/lesson-location';

const LIBRARY_API = '/api/domain/lesson-planner/library';

export function SaveStatus({
  conversationId,
  saved,
  saving,
  failed,
  units,
  onKeepOnItsOwn,
  onSaved,
}: {
  conversationId: string;
  saved: { location: LessonLocation; at: string; inLibrary: boolean };
  /** A change is on its way to the server. */
  saving: boolean;
  /** The last change came back with an error. */
  failed: boolean;
  /** The units a lesson on its own can be filed in. */
  units: Array<{ id: string; title: string; course: string | null }> | null;
  onKeepOnItsOwn: () => void;
  /** After it was filed in a unit: read the page again. */
  onSaved: () => void;
}) {
  // The time of the last save: the loader's, then each change that lands.
  const [at, setAt] = useState(saved.at);
  const wasSaving = useRef(saving);
  useEffect(() => {
    if (wasSaving.current && !saving && !failed) setAt(new Date().toISOString());
    wasSaving.current = saving;
  }, [saving, failed]);
  useEffect(() => setAt((current) => (saved.at > current ? saved.at : current)), [saved.at]);
  // "2 min ago" keeps up with the clock.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((count) => count + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const fileFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const filed = useRef<unknown>(null);
  useEffect(() => {
    if (fileFetcher.state !== 'idle' || !fileFetcher.data?.ok || filed.current === fileFetcher.data) return;
    filed.current = fileFetcher.data;
    onSaved();
  }, [fileFetcher.state, fileFetcher.data, onSaved]);
  const [choosing, setChoosing] = useState(false);
  const [keptOnItsOwn, setKeptOnItsOwn] = useState(false);
  const inLibrary = saved.inLibrary || keptOnItsOwn;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span data-testid="stack-save-state" className="inline-flex items-center gap-1 text-xs text-[var(--sv-muted)]" suppressHydrationWarning>
        {saving ? (
          'Saving…'
        ) : failed ? (
          <span className="text-red-700">Couldn’t save that change. Try it again.</span>
        ) : (
          <>
            <Check size={13} />
            <Link to={saved.location.href} data-testid="stack-save-where" className="underline-offset-2 hover:underline">
              {savedLine(saved.location, at)}
            </Link>
          </>
        )}
      </span>
      {inLibrary ? (
        <Link
          to={saved.location.href}
          data-testid="library-control"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#FBE5DC] px-4 py-2 text-sm font-semibold text-[var(--sv-primary)]"
        >
          <BookMarked size={15} /> In your library ✓
        </Link>
      ) : (
        <div className="relative">
          <button
            type="button"
            data-testid="library-control"
            aria-expanded={choosing}
            onClick={() => setChoosing((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sv-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            <BookMarked size={15} /> Save to library <ChevronDown size={14} />
          </button>
          {choosing ? (
            <div
              data-testid="library-choices"
              className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-[var(--sv-line)] bg-[var(--sv-card)] p-2 text-sm shadow-lg"
            >
              {units?.length ? (
                <>
                  <p className="px-2 pb-1 pt-1 text-xs font-semibold text-[var(--sv-muted)]">Put it in a unit</p>
                  <ul className="max-h-60 overflow-y-auto">
                    {units.map((unit) => (
                      <li key={unit.id}>
                        <button
                          type="button"
                          data-testid="library-choice-unit"
                          disabled={fileFetcher.state !== 'idle'}
                          onClick={() => {
                            setChoosing(false);
                            fileFetcher.submit(
                              { intent: 'move-lesson', conversationId, unitId: unit.id },
                              { method: 'post', action: LIBRARY_API }
                            );
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#F1EBE2]"
                        >
                          {unit.course ? `${unit.course} › ` : ''}
                          {unit.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="my-1 border-t border-[var(--sv-line)]" />
                </>
              ) : null}
              <button
                type="button"
                data-testid="library-choice-own"
                onClick={() => {
                  setChoosing(false);
                  setKeptOnItsOwn(true);
                  onKeepOnItsOwn();
                }}
                className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#F1EBE2]"
              >
                Keep it on its own
                <span className="block text-xs text-[var(--sv-muted)]">Under Lessons on their own in your library</span>
              </button>
            </div>
          ) : null}
          {fileFetcher.data?.error ? <p className="mt-1 text-xs text-red-700">{fileFetcher.data.error}</p> : null}
        </div>
      )}
    </div>
  );
}

/**
 * Asks before the teacher leaves while a change is still on its way: closing
 * or reloading the tab, or a link inside the app. `pending` is read when they
 * try to leave, so it always sees the latest state.
 */
export function useLeaveGuard(pending: () => boolean, onLeave?: () => void) {
  const latest = useRef({ pending, onLeave });
  latest.current = { pending, onLeave };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!latest.current.pending()) return;
      latest.current.onLeave?.();
      event.preventDefault();
      // Older browsers show the prompt only with a return value.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && latest.current.pending()
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('A change is still saving. Leave anyway?')) {
      latest.current.onLeave?.();
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);
}
