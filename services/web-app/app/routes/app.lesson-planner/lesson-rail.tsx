/**
 * The rail: which lesson am I in, and where are the rest.
 *
 * It used to be a permanent 16rem list of every conversation, the loudest
 * thing on the page after the transcript, which is what made the planner read
 * as a chat client rather than a place to build a lesson. A teacher opens this
 * page to make something, not to browse their history — so the history
 * collapses to a strip of icons and comes back when they ask for it.
 *
 * The list is split the way the teacher's lessons are: drafts they are still
 * working on, and the ones they published to their library. One tab at a time,
 * because a rail showing two lists at once is the wall of names again.
 *
 * Deliberately the only expanding panel on the left. The stack — what this
 * lesson is made of — belongs on the right, and two drawers competing for the
 * same gesture is the thing to avoid.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Library,
  PenLine,
  Plus,
} from 'lucide-react';
import { cn } from '~/utils/misc';
import { Button } from '~/components/ui/button';

export type RailLesson = { id: string; title: string; published: boolean };

export type RailTab = 'drafts' | 'library';

/** Remembered per browser: a teacher who wants it open should keep it open. */
const EXPANDED_KEY = 'yawp.lesson-rail.expanded';

export function readRailPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(EXPANDED_KEY) === 'true';
  } catch {
    // Private browsing, or storage disabled. Collapsed is the safe default.
    return false;
  }
}

function writeRailPreference(expanded: boolean): void {
  try {
    window.localStorage.setItem(EXPANDED_KEY, String(expanded));
  } catch {
    // Nothing to do — the rail still works, it just will not be remembered.
  }
}

/**
 * Which tab to open on.
 *
 * The lesson being worked on has to be visible in the list, or the rail opens
 * looking like it has lost it.
 */
export function initialRailTab(
  lessons: RailLesson[],
  activeId: string | null
): RailTab {
  const active = lessons.find((lesson) => lesson.id === activeId);
  return active?.published ? 'library' : 'drafts';
}

/**
 * Accessible names here have to stay distinct from each other and from the
 * chat header's "Switch lesson" picker: one name containing another makes both
 * ambiguous to anything selecting by name, a screen reader included. That is
 * why the toggle says "lesson history" rather than "your lessons".
 */
export function LessonRail({
  lessons,
  activeId,
  onSelect,
  onNewLesson,
}: {
  lessons: RailLesson[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewLesson: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<RailTab>('drafts');

  // Read on mount rather than in useState: the server renders this collapsed,
  // and reading storage during the first render would not match.
  useEffect(() => setExpanded(readRailPreference()), []);
  useEffect(() => setTab(initialRailTab(lessons, activeId)), [activeId]);

  function toggle() {
    setExpanded((current) => {
      writeRailPreference(!current);
      return !current;
    });
  }

  const drafts = lessons.filter((lesson) => !lesson.published);
  const library = lessons.filter((lesson) => lesson.published);
  const shown = tab === 'drafts' ? drafts : library;

  if (!expanded) {
    return (
      <aside
        data-testid="lesson-rail"
        data-expanded="false"
        className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r bg-secondary/40 py-3 md:flex"
      >
        <button
          type="button"
          onClick={onNewLesson}
          aria-label="New lesson"
          className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-foreground transition hover:bg-foreground/5"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label="Show lesson history"
          aria-expanded={false}
          data-testid="lesson-rail-toggle"
          className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        >
          <ChevronRight size={16} />
        </button>
        {/* Collapsed must not mean cut off: the full list is still one click
            away, under the same name it has when the rail is open. */}
        <Link
          to="/app/lesson-planner/library"
          aria-label="All your lessons"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        >
          <Library size={16} />
        </Link>
      </aside>
    );
  }

  return (
    <aside
      data-testid="lesson-rail"
      data-expanded="true"
      className="hidden w-64 shrink-0 flex-col border-r bg-secondary/40 md:flex"
    >
      <div className="flex items-center gap-2 p-3">
        <Button
          variant="outline"
          className="flex-1 justify-start gap-2"
          onClick={onNewLesson}
        >
          <Plus size={16} /> New lesson
        </Button>
        <button
          type="button"
          onClick={toggle}
          aria-label="Hide lesson history"
          aria-expanded
          data-testid="lesson-rail-toggle"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Two histories, one at a time. */}
      <div className="mx-3 mb-2 flex rounded-lg border bg-background p-0.5">
        {(
          [
            {
              id: 'drafts' as const,
              label: 'Drafts',
              icon: PenLine,
              count: drafts.length,
            },
            {
              id: 'library' as const,
              label: 'Library',
              icon: BookMarked,
              count: library.length,
            },
          ] satisfies Array<{
            id: RailTab;
            label: string;
            icon: typeof PenLine;
            count: number;
          }>
        ).map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            data-testid={`lesson-rail-tab-${id}`}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition',
              { 'bg-primary/10 text-primary': tab === id }
            )}
          >
            <Icon size={12} />
            {label}
            <span className="tabular-nums opacity-60">{count}</span>
          </button>
        ))}
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-2 pb-3">
        {shown.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            {tab === 'drafts'
              ? 'Lessons you plan will show up here.'
              : 'Lessons you publish will show up here.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {shown.map((lesson) => (
              <li key={lesson.id}>
                <button
                  type="button"
                  onClick={() => onSelect(lesson.id)}
                  className={cn(
                    'w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                    {
                      'bg-primary/10 text-primary hover:bg-primary/10':
                        lesson.id === activeId,
                    }
                  )}
                >
                  <span className="truncate">{lesson.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t px-3 py-2">
        <Link
          to="/app/lesson-planner/library"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          All your lessons
        </Link>
      </div>
    </aside>
  );
}
