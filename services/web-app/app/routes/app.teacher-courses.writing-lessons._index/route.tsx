import {
  type LoaderFunctionArgs,
  data as dataResponse,
  useLoaderData,
  Link,
} from 'react-router';
import { BookOpen, Plus, GraduationCap } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import { cn } from '~/utils/misc';
import {
  WRITING_LESSON_TOPICS,
  WRITING_LESSON_CATEGORIES,
  type WritingLessonTopicKey,
} from '~/utils/writing-lessons/topics';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profiles: { include: { teacherProfile: true } } },
  });

  const teacherProfile = user?.profiles
    .map((p) => p.teacherProfile)
    .find(Boolean);

  if (!teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const lessons = await prisma.writingLesson.findMany({
    where: {
      OR: [
        { teacherProfileId: teacherProfile.id },
        { isTemplate: true },
      ],
    },
    select: {
      id: true,
      title: true,
      topic: true,
      gradeLevel: true,
      isTemplate: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const groupedByTopic = WRITING_LESSON_CATEGORIES.map((category) => {
    const topicsInCategory = Object.values(WRITING_LESSON_TOPICS).filter(
      (t) => t.category === category
    );
    const topicKeys = topicsInCategory.map((t) => t.key);
    const lessonsInCategory = lessons.filter((l) =>
      topicKeys.includes(l.topic as WritingLessonTopicKey)
    );
    return {
      category,
      topics: topicsInCategory,
      lessons: lessonsInCategory,
    };
  }).filter((group) => group.lessons.length > 0);

  return dataResponse({ lessons, groupedByTopic });
}

export default function WritingLessonsIndexRoute() {
  const { lessons, groupedByTopic } = useLoaderData<typeof loader>();

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <h2>Quick Writing Lessons</h2>
              <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
                AI-generated mini-lessons on critical writing skills. Assign to
                your classes or individual students.
              </p>
            </div>
            <Button asChild>
              <Link to="./new">
                <Plus className="mr-2 h-4 w-4" />
                Generate New Lesson
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
        {lessons.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted py-12">
            <BookOpen className="mb-4 h-12 w-12 text-muted-foreground" />
            <span className="text-lg font-bold">No lessons yet</span>
            <span className="mt-1 text-sm text-muted-foreground">
              Generate your first writing lesson to get started.
            </span>
            <Button asChild className="mt-4">
              <Link to="./new">
                <Plus className="mr-2 h-4 w-4" />
                Generate New Lesson
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedByTopic.map((group) => (
              <div key={group.category}>
                <h3 className="mb-4 text-lg font-semibold">
                  {group.category}
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.lessons.map((lesson) => {
                    const topicDef =
                      WRITING_LESSON_TOPICS[
                        lesson.topic as WritingLessonTopicKey
                      ];
                    return (
                      <Card
                        key={lesson.id}
                        className="bg-muted transition-shadow hover:shadow-lg"
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <CardTitle className="line-clamp-2 text-base">
                              {lesson.title}
                            </CardTitle>
                            {lesson.isTemplate && (
                              <span className="ml-2 shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                Template
                              </span>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {topicDef?.name ?? lesson.topic}
                          </p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <GraduationCap className="h-3.5 w-3.5" />
                            <span className="capitalize">
                              {lesson.gradeLevel.replace('-', ' ')}
                            </span>
                          </div>
                          <div className="mt-4 flex gap-2">
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`./${lesson.id}`}>View</Link>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`./${lesson.id}/assign`}>Assign</Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
