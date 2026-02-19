import { useState } from 'react';
import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  useLoaderData,
  Link,
} from 'react-router';
import { useFetcher } from 'react-router';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { ChevronLeft, Pencil, Send, Save } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { FormInput } from '~/components/rvf-forms/form-input';
import { FormTextarea } from '~/components/rvf-forms/form-textarea';
import { FormSelect } from '~/components/rvf-forms/form-select';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import { cn } from '~/utils/misc';
import {
  WRITING_LESSON_TOPICS,
  GRADE_LEVELS,
  type WritingLessonTopicKey,
} from '~/utils/writing-lessons/topics';

const gradeLevelOptions = GRADE_LEVELS.map((g) => ({
  value: g.value,
  label: g.label,
}));

const UpdateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  gradeLevel: z.enum(
    GRADE_LEVELS.map((g) => g.value) as [string, ...string[]]
  ),
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profiles: { include: { teacherProfile: true } } },
  });

  if (!user?.profiles.some((p) => p.teacherProfile)) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const lesson = await prisma.writingLesson.findUnique({
    where: { id: params.lessonId },
    select: {
      id: true,
      title: true,
      topic: true,
      gradeLevel: true,
      content: true,
      exercises: true,
      isTemplate: true,
      createdAt: true,
      teacherProfileId: true,
      assignments: {
        select: {
          id: true,
          createdAt: true,
          dueAt: true,
          class: { select: { id: true, grade: true, period: true } },
          studentProfile: {
            select: {
              id: true,
              profile: {
                select: { user: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  return dataResponse({ lesson });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profiles: { include: { teacherProfile: true } } },
  });

  if (!user?.profiles.some((p) => p.teacherProfile)) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const lesson = await prisma.writingLesson.findUnique({
    where: { id: params.lessonId },
    select: { id: true },
  });

  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const { error, data } = await parseFormData(request, UpdateSchema);
  if (error) return validationError(error);

  await prisma.writingLesson.update({
    where: { id: lesson.id },
    data: {
      title: data.title,
      content: data.content,
      gradeLevel: data.gradeLevel,
    },
  });

  return dataResponse({ success: true });
}

export default function WritingLessonDetailRoute() {
  const { lesson } = useLoaderData<typeof loader>();
  const [isEditing, setIsEditing] = useState(false);
  const fetcher = useFetcher();
  const isSaving = fetcher.state !== 'idle';

  const topicDef =
    WRITING_LESSON_TOPICS[lesson.topic as WritingLessonTopicKey];

  const form = useForm({
    schema: UpdateSchema,
    defaultValues: {
      title: lesson.title,
      content: lesson.content,
      gradeLevel: lesson.gradeLevel,
    },
    handleSubmit: (_data, formData) => {
      fetcher.submit(formData, { method: 'POST' });
    },
  });

  // Close edit mode on successful save
  if (fetcher.data?.success && isEditing) {
    setIsEditing(false);
  }

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <Button variant="outline" asChild>
              <Link to="/app/teacher-courses/writing-lessons">
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to Lesson Library
              </Link>
            </Button>
            <div className="flex gap-2">
              {!isEditing && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
              <Button asChild>
                <Link to={`/app/teacher-courses/writing-lessons/${lesson.id}/assign`}>
                  <Send className="mr-2 h-4 w-4" />
                  Assign
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2">
            {isEditing ? (
              <Card className="bg-muted">
                <CardHeader>
                  <CardTitle>Edit Lesson</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    {...form.getFormProps()}
                    className="flex flex-col gap-4"
                  >
                    <FormInput
                      scope={form.scope('title')}
                      label="Title"
                    />

                    <FormSelect
                      scope={form.scope('gradeLevel')}
                      label="Grade Level"
                      options={gradeLevelOptions}
                    />

                    <FormTextarea
                      scope={form.scope('content')}
                      label="Lesson Content (Markdown)"
                      rows={20}
                    />

                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        isLoading={isSaving}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditing(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-muted">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-2xl">
                        {lesson.title}
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {topicDef?.name ?? lesson.topic} &middot;{' '}
                        <span className="capitalize">
                          {lesson.gradeLevel.replace('-', ' ')}
                        </span>
                      </p>
                    </div>
                    {lesson.isTemplate && (
                      <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Template
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                    {lesson.content}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="bg-muted">
              <CardHeader>
                <CardTitle className="text-base">Assignments</CardTitle>
              </CardHeader>
              <CardContent>
                {lesson.assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This lesson has not been assigned yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {lesson.assignments.map((assignment) => (
                      <li
                        key={assignment.id}
                        className="rounded border bg-background p-3 text-sm"
                      >
                        {assignment.class ? (
                          <span className="font-medium">
                            Grade {assignment.class.grade}, Period{' '}
                            {assignment.class.period}
                          </span>
                        ) : assignment.studentProfile ? (
                          <span className="font-medium">
                            {assignment.studentProfile.profile.user.name ??
                              'Student'}
                          </span>
                        ) : (
                          <span className="font-medium">Assignment</span>
                        )}
                        {assignment.dueAt && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Due:{' '}
                            {new Date(assignment.dueAt).toLocaleDateString()}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
