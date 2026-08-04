import {
  Link,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { ChevronLeft, FileText, Lightbulb } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { buildLessonLibrary } from '~/domain/lesson-planner/lesson-library';
import { timeAgo } from '~/utils/timeAgo';

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');

  const lessons = await prisma.lessonPlanConversation.findMany({
    where: {
      membershipId: access.membership.id,
      deletedAt: null,
      // Only lessons with something kept; drafts stay in the planner's rail.
      messages: { some: { keptAt: { not: null } } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      packetTitle: true,
      updatedAt: true,
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

export default function LessonLibraryRoute() {
  const { lessons } = useLoaderData<typeof loader>();

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
            <h1 className="text-xl font-semibold leading-none">
              Lesson library
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every lesson you have built and kept.
            </p>
          </div>
        </div>

        {lessons.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <div className="mx-auto mb-3 w-fit rounded-2xl bg-primary/10 p-3 text-primary">
              <Lightbulb size={24} />
            </div>
            <h2 className="text-base font-semibold">No lessons kept yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Plan a lesson, then use <strong>Keep for the lesson</strong> on
              the parts worth holding onto. Anything you keep gets assembled
              into a printable packet and shows up here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/app/lesson-planner/${lesson.id}/packet`}
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
                    <Badge variant="outline" size="sm">
                      <FileText size={12} className="mr-1" />
                      {lesson.sectionCount}{' '}
                      {lesson.sectionCount === 1 ? 'section' : 'sections'}
                    </Badge>
                    {lesson.handoutCount > 0 ? (
                      <Badge variant="outline" size="sm">
                        {lesson.handoutCount}{' '}
                        {lesson.handoutCount === 1 ? 'handout' : 'handouts'}
                      </Badge>
                    ) : null}
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/app/lesson-planner?c=${lesson.id}`}>
                        Keep planning
                      </Link>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
