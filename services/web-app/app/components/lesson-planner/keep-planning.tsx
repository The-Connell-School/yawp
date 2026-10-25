/**
 * Keep planning (Brian's round 4, item 7): the lessons a teacher was just
 * working on, with where each is saved, at the top of the library and on the
 * planner home, so a lesson they just made is always one click away.
 */
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { savedAgo, type RecentLesson } from '~/domain/lesson-planner/lesson-location';

export function KeepPlanning({ lessons, className }: { lessons: RecentLesson[]; className?: string }) {
  if (!lessons.length) return null;
  return (
    <section data-testid="keep-planning" aria-labelledby="keep-planning-heading" className={className}>
      <h2 id="keep-planning-heading" className="text-sm font-semibold text-muted-foreground">
        Keep planning
      </h2>
      <ul className="mt-2 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <Link
              to={lesson.href}
              data-testid="keep-planning-lesson"
              className="group flex h-full flex-col gap-1 rounded-[10px] border border-border bg-popover p-3 text-left shadow-[0_1px_2px_rgba(28,26,23,.06),0_4px_12px_-4px_rgba(28,26,23,.10)] transition-[transform,box-shadow,border-color] duration-[160ms] hover:-translate-y-0.5 hover:border-[hsl(51_8%_68%)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="line-clamp-2 font-semibold text-foreground">{lesson.title}</span>
              <span data-testid="keep-planning-where" className="text-xs text-muted-foreground" suppressHydrationWarning>
                Saved to {lesson.where} · {savedAgo(lesson.savedAt)}
              </span>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold text-primary">
                Open <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
