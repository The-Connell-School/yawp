import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  useLoaderData,
  redirect,
  Link,
  useNavigation,
} from 'react-router';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { ChevronLeft, Send } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { FormInput } from '~/components/rvf-forms/form-input';
import { FormSelect } from '~/components/rvf-forms/form-select';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import {
  WRITING_LESSON_TOPICS,
  type WritingLessonTopicKey,
} from '~/utils/writing-lessons/topics';

const AssignSchema = z.object({
  classId: z.string().optional(),
  studentProfileId: z.string().optional(),
  dueAt: z.string().optional(),
}).refine(
  (data) => data.classId || data.studentProfileId,
  { message: 'Select a class or a student', path: ['classId'] }
);

export async function loader({ request, params }: LoaderFunctionArgs) {
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

  const lesson = await prisma.writingLesson.findUnique({
    where: { id: params.lessonId },
    select: {
      id: true,
      title: true,
      topic: true,
      gradeLevel: true,
    },
  });

  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const classes = await prisma.class.findMany({
    where: {
      teachers: { some: { id: teacherProfile.id } },
      isArchived: false,
    },
    select: {
      id: true,
      grade: true,
      period: true,
      title: true,
      students: {
        select: {
          id: true,
          profile: {
            select: { user: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: [{ grade: 'asc' }, { period: 'asc' }],
  });

  return dataResponse({ lesson, classes, teacherProfileId: teacherProfile.id });
}

export async function action({ request, params }: ActionFunctionArgs) {
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

  const lesson = await prisma.writingLesson.findUnique({
    where: { id: params.lessonId },
    select: { id: true },
  });

  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const { error, data } = await parseFormData(request, AssignSchema);
  if (error) return validationError(error);

  await prisma.writingLessonAssignment.create({
    data: {
      lessonId: lesson.id,
      teacherProfileId: teacherProfile.id,
      classId: data.classId || null,
      studentProfileId: data.studentProfileId || null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
    },
  });

  return redirect(
    `/app/teacher-courses/writing-lessons/${params.lessonId}`
  );
}

export default function AssignWritingLessonRoute() {
  const { lesson, classes, teacherProfileId } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';

  const topicDef =
    WRITING_LESSON_TOPICS[lesson.topic as WritingLessonTopicKey];

  const classOptions = classes.map((c) => ({
    value: c.id,
    label: `${c.title ? c.title + ' - ' : ''}Grade ${c.grade}, Period ${c.period}`,
  }));

  const allStudents = classes.flatMap((c) =>
    c.students.map((s) => ({
      value: s.id,
      label: s.profile.user.name ?? 'Unnamed Student',
    }))
  );

  // Deduplicate students by id
  const studentOptions = allStudents.filter(
    (s, i, arr) => arr.findIndex((x) => x.value === s.value) === i
  );

  const form = useForm({
    schema: AssignSchema,
    method: 'POST',
    defaultValues: {
      classId: '',
      studentProfileId: '',
      dueAt: '',
    },
  });

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <Button variant="outline" asChild className="mb-4">
            <Link
              to={`/app/teacher-courses/writing-lessons/${lesson.id}`}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to Lesson
            </Link>
          </Button>
          <div className="flex flex-col">
            <h2>Assign Lesson</h2>
            <p className="mt-2 text-muted-foreground">
              Assigning: <strong>{lesson.title}</strong> (
              {topicDef?.name ?? lesson.topic})
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
        <Card className="max-w-lg bg-muted">
          <CardHeader>
            <CardTitle>Assignment Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form {...form.getFormProps()} className="flex flex-col gap-4">
              <FormSelect
                scope={form.scope('classId')}
                label="Assign to Class"
                placeholder="Select a class (optional)"
                options={classOptions}
              />

              <FormSelect
                scope={form.scope('studentProfileId')}
                label="Or Assign to Individual Student"
                placeholder="Select a student (optional)"
                options={studentOptions}
              />

              <FormInput
                scope={form.scope('dueAt')}
                label="Due Date (Optional)"
                type="datetime-local"
              />

              <Button
                type="submit"
                className="w-full"
                isLoading={isSubmitting}
              >
                <Send className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Assigning...' : 'Assign Lesson'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
