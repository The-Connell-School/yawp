import {
  type LoaderFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { WRITING_LESSON_TOPICS } from '~/utils/writing-lessons/topics';
import { Button } from '~/components/ui/button';
import { Plus, BookOpen, Edit, Users, Trash2 } from 'lucide-react';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  // Fetch teacher's saved lessons
  const lessons = await prisma.writingLesson.findMany({
    where: {
      teacherProfileId: profile.teacherProfile.id,
    },
    include: {
      assignments: {
        include: {
          class: {
            select: {
              grade: true,
              period: true,
              title: true,
            },
          },
          studentProfile: {
            include: {
              profile: {
                include: {
                  user: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          assignments: true,
          sessions: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return dataResponse({ lessons });
}

export default function TeacherWritingLessonsIndex() {
  const { lessons } = useLoaderData<typeof loader>();

  return (
    <div className="h-full w-full overflow-y-auto">
      {/* Header */}
      <div className="border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-3">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold mb-2">Writing Lessons Library</h1>
                <p className="text-muted-foreground">
                  Your saved writing lessons. Generate new lessons or assign existing ones to your classes.
                </p>
              </div>
            </div>
            <Link to="/app/teacher-lounge/writing-lessons/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Lesson
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-screen-lg p-5 pb-24">
        {lessons.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No lessons yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first AI-generated writing lesson
            </p>
            <Link to="/app/teacher-lounge/writing-lessons/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Lesson
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {lessons.map((lesson) => {
              const topicInfo = WRITING_LESSON_TOPICS[lesson.topic];
              return (
                <div
                  key={lesson.id}
                  className="rounded-lg border bg-card p-6 hover:shadow transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-lg">{lesson.title}</h3>
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                          {lesson.gradeLevel.replace('-', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        {topicInfo.name} — {topicInfo.description}
                      </p>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Users className="h-4 w-4" />
                          <span>
                            {lesson._count.assignments}{' '}
                            {lesson._count.assignments === 1
                              ? 'assignment'
                              : 'assignments'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <BookOpen className="h-4 w-4" />
                          <span>
                            {lesson._count.sessions}{' '}
                            {lesson._count.sessions === 1 ? 'student' : 'students'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Link
                        to={`/app/teacher-lounge/writing-lessons/${lesson.id}`}
                      >
                        <Button variant="outline" size="sm" className="gap-2">
                          <Edit className="h-4 w-4" />
                          Edit
                        </Button>
                      </Link>
                      <Link
                        to={`/app/teacher-lounge/writing-lessons/${lesson.id}/assign`}
                      >
                        <Button size="sm" className="gap-2">
                          <Users className="h-4 w-4" />
                          Assign
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
