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
import { ChevronLeft, Sparkles } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { FormInput } from '~/components/rvf-forms/form-input';
import { FormSelect } from '~/components/rvf-forms/form-select';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import { generateLesson } from '~/utils/writing-lessons/generateLesson.server';
import {
  WRITING_LESSON_TOPICS,
  GRADE_LEVELS,
  type WritingLessonTopicKey,
} from '~/utils/writing-lessons/topics';

const topicOptions = Object.values(WRITING_LESSON_TOPICS).map((t) => ({
  value: t.key,
  label: t.name,
}));

const gradeLevelOptions = GRADE_LEVELS.map((g) => ({
  value: g.value,
  label: g.label,
}));

const Schema = z.object({
  topic: z.enum(
    Object.keys(WRITING_LESSON_TOPICS) as [string, ...string[]]
  ),
  gradeLevel: z.enum(
    GRADE_LEVELS.map((g) => g.value) as [string, ...string[]]
  ),
  customFocus: z.string().optional(),
});

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

  return dataResponse({ teacherProfileId: teacherProfile.id });
}

export async function action({ request }: ActionFunctionArgs) {
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

  const { error, data } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  const topicKey = data.topic as WritingLessonTopicKey;
  const topicDef = WRITING_LESSON_TOPICS[topicKey];

  const content = await generateLesson({
    topic: topicKey,
    gradeLevel: data.gradeLevel,
    customFocus: data.customFocus || undefined,
  });

  const lesson = await prisma.writingLesson.create({
    data: {
      topic: topicKey,
      title: topicDef.name,
      gradeLevel: data.gradeLevel,
      content,
      exercises: [],
      teacherProfileId: teacherProfile.id,
      isTemplate: false,
    },
  });

  return redirect(
    `/app/teacher-courses/writing-lessons/${lesson.id}`
  );
}

export default function NewWritingLessonRoute() {
  const { teacherProfileId } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== 'idle';

  const form = useForm({
    schema: Schema,
    method: 'POST',
    defaultValues: {
      topic: '',
      gradeLevel: '',
      customFocus: '',
    },
  });

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <Button variant="outline" asChild className="mb-4">
            <Link to="/app/teacher-courses/writing-lessons">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to Lesson Library
            </Link>
          </Button>
          <div className="flex flex-col">
            <h2>Generate New Lesson</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[500px]">
              Choose a writing topic and grade level. Our AI will generate a
              complete mini-lesson with examples and practice exercises.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
        <Card className="max-w-lg bg-muted">
          <CardHeader>
            <CardTitle>Lesson Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form {...form.getFormProps()} className="flex flex-col gap-4">
              <FormSelect
                scope={form.scope('topic')}
                label="Writing Topic"
                placeholder="Select a topic"
                options={topicOptions}
              />

              <FormSelect
                scope={form.scope('gradeLevel')}
                label="Grade Level"
                placeholder="Select grade level"
                options={gradeLevelOptions}
              />

              <FormInput
                scope={form.scope('customFocus')}
                label="Custom Focus (Optional)"
                placeholder="e.g., Focus on persuasive essay examples"
              />

              <Button
                type="submit"
                className="w-full"
                isLoading={isSubmitting}
              >
                {isSubmitting ? (
                  'Generating Lesson...'
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Lesson
                  </>
                )}
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
