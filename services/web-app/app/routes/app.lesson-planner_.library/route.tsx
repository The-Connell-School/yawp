/**
 * Every lesson this teacher has planned, in one list.
 *
 * Previously this page showed a filtered subset — lessons that happened to
 * have something kept — while the planner's rail showed everything under the
 * heading "Saved lessons". Two lists, both claiming to be the saved ones, and
 * no way to put a lesson in either on purpose. Now: one history, starred
 * lessons on top, and the star is a decision the teacher makes and can undo.
 */
import {
  Link,
  redirect,
  useFetcher,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { ChevronLeft, FileText, Lightbulb, Star, Trash2 } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import {
  buildLessonLibrary,
  groupLessonHistory,
  type LibraryLesson,
} from '~/domain/lesson-planner/lesson-library';
import { timeAgo } from '~/utils/timeAgo';

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');

  const lessons = await prisma.lessonPlanConversation.findMany({
    where: { membershipId: access.membership.id, deletedAt: null },
    // Starred first, then by recency, so a lesson taught every year does not
    // sink under this week's drafts.
    orderBy: [{ starredAt: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      title: true,
      packetTitle: true,
      updatedAt: true,
      starredAt: true,
      messages: {
        where: { keptAt: { not: null } },
        select: { keptAudience: true },
      },
      originClassAssignment: {
        select: {
          class: { select: { title: true, grade: true, period: true } },
          assignment: { select: { title: true } },
        },
      },
    },
  });

  return { lessons: buildLessonLibrary(lessons) };
}

function LessonRow({ lesson }: { lesson: LibraryLesson }) {
  const fetcher = useFetcher();
  // Answer the click immediately rather than after the round trip: a star that
  // lags feels broken even when it works.
  const starred = fetcher.formData
    ? fetcher.formData.get('intent') === 'star'
    : lesson.starred;
  const deleting = fetcher.formData?.get('intent') === 'delete';

  if (deleting) return null;

  function send(intent: 'star' | 'unstar' | 'delete') {
    fetcher.submit(
      { intent, conversationId: lesson.id },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }

  return (
    <li>
      <div
        data-testid="history-lesson"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card p-4"
      >
        <button
          type="button"
          onClick={() => send(starred ? 'unstar' : 'star')}
          aria-pressed={starred}
          aria-label={
            starred ? `Unstar ${lesson.title}` : `Star ${lesson.title}`
          }
          data-testid="history-star"
          className={cn(
            'shrink-0 rounded-md p-1.5 transition',
            starred
              ? 'text-primary hover:bg-primary/10'
              : 'text-muted-foreground/50 hover:bg-foreground/5 hover:text-foreground'
          )}
        >
          <Star size={16} fill={starred ? 'currentColor' : 'none'} />
        </button>

        <div className="min-w-0 flex-1">
          <Link
            to={`/app/lesson-planner?c=${lesson.id}`}
            className="font-medium hover:text-primary hover:underline"
          >
            {lesson.title}
          </Link>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[
              lesson.className,
              lesson.assignmentTitle,
              `Updated ${timeAgo(new Date(lesson.updatedAt))}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {lesson.sectionCount > 0 ? (
            <Badge variant="outline" size="sm">
              <FileText size={12} className="mr-1" />
              {lesson.sectionCount}{' '}
              {lesson.sectionCount === 1 ? 'piece' : 'pieces'}
            </Badge>
          ) : (
            <Badge variant="outline" size="sm">
              Draft
            </Badge>
          )}
          {lesson.handoutCount > 0 ? (
            <Badge variant="outline" size="sm">
              {lesson.handoutCount}{' '}
              {lesson.handoutCount === 1 ? 'handout' : 'handouts'}
            </Badge>
          ) : null}
          {lesson.sectionCount > 0 ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/app/lesson-planner/${lesson.id}/packet`}>Stack</Link>
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => send('delete')}
            aria-label={`Delete ${lesson.title}`}
            data-testid="history-delete"
            className="rounded-md p-1.5 text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </li>
  );
}

export default function LessonHistoryRoute() {
  const { lessons } = useLoaderData<typeof loader>();
  const { starred, recent } = groupLessonHistory(lessons);

  return (
    // Own the scroll: the app shell is a fixed-height, overflow-hidden frame.
    <section className="h-full w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/lesson-planner">
              <ChevronLeft size={16} className="mr-1" />
              Back to planning
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-none">Your lessons</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything you have planned. Star the ones worth teaching again.
            </p>
          </div>
        </div>

        {lessons.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <div className="mx-auto mb-3 w-fit rounded-2xl bg-primary/10 p-3 text-primary">
              <Lightbulb size={24} />
            </div>
            <h2 className="text-base font-semibold">No lessons yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Plan a lesson and it shows up here — named after the lesson, not
              after what you typed to start it.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {starred.length ? (
              <div>
                <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Star size={12} className="text-primary" />
                  Starred
                </h2>
                <ul className="flex flex-col gap-2">
                  {starred.map((lesson) => (
                    <LessonRow key={lesson.id} lesson={lesson} />
                  ))}
                </ul>
              </div>
            ) : null}

            {recent.length ? (
              <div>
                {starred.length ? (
                  <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Everything else
                  </h2>
                ) : null}
                <ul className="flex flex-col gap-2">
                  {recent.map((lesson) => (
                    <LessonRow key={lesson.id} lesson={lesson} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
