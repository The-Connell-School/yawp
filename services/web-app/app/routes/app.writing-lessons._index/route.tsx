import {
  type LoaderFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { Link, useLoaderData } from 'react-router';
import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  Clock,
} from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { cn } from '~/utils/misc';
import { getTopicsGroupedByCategory } from '~/utils/writing-lessons/topics';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.studentProfile) {
    throw new Response('Student profile required', { status: 403 });
  }

  const studentProfileId = profile.studentProfile.id;
  const classIds = profile.studentProfile.classes.map((c) => c.id);

  const [lessons, assignments, sessions] = await Promise.all([
    prisma.writingLesson.findMany({
      where: { isTemplate: true },
      select: {
        id: true,
        topic: true,
        title: true,
        gradeLevel: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.writingLessonAssignment.findMany({
      where: {
        OR: [
          { studentProfileId },
          ...(classIds.length > 0
            ? [{ classId: { in: classIds } }]
            : []),
        ],
      },
      select: {
        id: true,
        dueAt: true,
        lesson: {
          select: {
            id: true,
            topic: true,
            title: true,
          },
        },
        teacherProfile: {
          select: {
            profile: {
              select: {
                user: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.writingLessonSession.findMany({
      where: { studentProfileId },
      select: {
        lessonId: true,
        completedAt: true,
      },
    }),
  ]);

  const completedLessonIds = new Set(
    sessions.filter((s) => s.completedAt).map((s) => s.lessonId)
  );
  const startedLessonIds = new Set(sessions.map((s) => s.lessonId));

  return dataResponse({
    lessons,
    assignments,
    completedLessonIds: Array.from(completedLessonIds),
    startedLessonIds: Array.from(startedLessonIds),
  });
}

export default function WritingLessonsIndexRoute() {
  const { lessons, assignments, completedLessonIds, startedLessonIds } =
    useLoaderData<typeof loader>();

  const completedSet = new Set(completedLessonIds);
  const startedSet = new Set(startedLessonIds);
  const groupedTopics = getTopicsGroupedByCategory();

  const lessonsByTopic = new Map(lessons.map((l) => [l.topic, l]));

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>Quick Writing Lessons</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[500px]">
              Targeted mini-lessons to sharpen specific writing skills.
              Each lesson includes a brief explanation, examples, and
              hands-on practice exercises.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        {assignments.length > 0 && (
          <div className="mb-6 space-y-3">
            <h3 className="text-lg font-semibold">Assigned to You</h3>
            {assignments.map((assignment) => (
              <Link
                key={assignment.id}
                to={`/app/writing-lessons/${assignment.lesson.id}`}
                className="block"
              >
                <Card className="border-primary/30 bg-primary/5 transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <ClipboardList className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">
                        {assignment.lesson.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Assigned by{' '}
                        {assignment.teacherProfile.profile.user.name ??
                          'your teacher'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {assignment.dueAt && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>
                            Due{' '}
                            {new Date(
                              assignment.dueAt
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <div className="space-y-8">
          {groupedTopics.map((group) => (
            <div key={group.category}>
              <h3 className="mb-3 text-lg font-semibold">
                {group.category}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.topics.map((topic) => {
                  const lesson = lessonsByTopic.get(topic.key);
                  const isCompleted = lesson
                    ? completedSet.has(lesson.id)
                    : false;
                  const isStarted = lesson
                    ? startedSet.has(lesson.id)
                    : false;

                  return (
                    <Link
                      key={topic.key}
                      to={
                        lesson
                          ? `/app/writing-lessons/${lesson.id}`
                          : '#'
                      }
                      className={cn(
                        'block',
                        !lesson && 'pointer-events-none opacity-50'
                      )}
                    >
                      <Card
                        className={cn(
                          'h-full transition-shadow hover:shadow-md',
                          isCompleted && 'border-green-300 bg-green-50/50'
                        )}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-base">
                              {topic.name}
                            </CardTitle>
                            {isCompleted ? (
                              <Badge variant="success" size="sm">
                                Done
                              </Badge>
                            ) : isStarted ? (
                              <Badge variant="info-outlined" size="sm">
                                In Progress
                              </Badge>
                            ) : null}
                          </div>
                          <CardDescription>
                            {topic.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <BookOpen className="h-4 w-4" />
                            <span>Mini-lesson + practice</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
