import {
  type ActionFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { useFetcher } from 'react-router';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { generateLesson, generateLessonTitle } from '~/utils/writing-lessons/generateLesson.server';
import { parseLesson, validateLesson } from '~/utils/writing-lessons/parseLesson';
import { WritingLessonTopic } from '@app/prisma';
import { WRITING_LESSON_TOPICS, GRADE_LEVELS } from '~/utils/writing-lessons/topics';
import { FormSelect } from '~/components/rvf-forms/form-select';
import { FormInput } from '~/components/rvf-forms/form-input';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { ArrowLeft, Loader2, Sparkles, Save } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { LessonContent } from '~/components/writing-lessons/lesson-content';

const GenerateSchema = z.object({
  topic: z.nativeEnum(WritingLessonTopic),
  gradeLevel: z.enum(['middle-school', 'high-school', 'college']),
  customFocus: z.string().optional(),
});

const SaveSchema = z.object({
  topic: z.nativeEnum(WritingLessonTopic),
  gradeLevel: z.string(),
  content: z.string().min(100, 'Lesson content is too short'),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get('intent');

  // Generate lesson
  if (intent === 'generate') {
    const { error, data } = await parseFormData(request, GenerateSchema);
    if (error) return validationError(error);

    try {
      const content = await generateLesson({
        topic: data.topic,
        gradeLevel: data.gradeLevel as any,
        customFocus: data.customFocus,
      });

      return dataResponse({ content });
    } catch (err) {
      return dataResponse(
        {
          error:
            'Failed to generate lesson. Please try again or contact support.',
        },
        { status: 500 }
      );
    }
  }

  // Save lesson
  if (intent === 'save') {
    const { error, data } = await parseFormData(request, SaveSchema);
    if (error) return validationError(error);

    try {
      // Parse and validate the lesson
      const parsed = parseLesson(data.content);
      const validation = validateLesson(parsed);

      if (!validation.isValid) {
        return dataResponse(
          {
            error: `Lesson validation failed: ${validation.errors.join(', ')}`,
          },
          { status: 400 }
        );
      }

      // Create the lesson
      const lesson = await prisma.writingLesson.create({
        data: {
          topic: data.topic,
          title: generateLessonTitle(data.topic, data.gradeLevel as any),
          gradeLevel: data.gradeLevel,
          content: data.content,
          exercises: parsed.exercises,
          teacherProfileId: profile.teacherProfile.id,
        },
      });

      return redirect(`/app/teacher-lounge/writing-lessons/${lesson.id}`);
    } catch (err) {
      console.error('Failed to save lesson:', err);
      return dataResponse(
        { error: 'Failed to save lesson. Please try again.' },
        { status: 500 }
      );
    }
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

export default function NewWritingLesson() {
  const fetcher = useFetcher<typeof action>();
  const [generatedContent, setGeneratedContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm({
    schema: GenerateSchema,
    method: 'POST',
    defaultValues: {
      topic: undefined,
      gradeLevel: 'high-school',
      customFocus: '',
    },
  });

  const isGenerating = fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'generate';
  const isSaving = fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'save';

  // Update generated content when received
  if (fetcher.data && 'content' in fetcher.data && !generatedContent) {
    setGeneratedContent(fetcher.data.content);
  }

  const handleGenerate = () => {
    form.submit((data) => ({
      ...data,
      intent: 'generate',
    }));
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.append('intent', 'save');
    formData.append('topic', form.value('topic') || '');
    formData.append('gradeLevel', form.value('gradeLevel') || 'high-school');
    formData.append('content', generatedContent);
    fetcher.submit(formData, { method: 'POST' });
  };

  const topicOptions = Object.entries(WRITING_LESSON_TOPICS).map(
    ([value, info]) => ({
      label: info.name,
      value,
    })
  );

  const gradeLevelOptions = GRADE_LEVELS.map((level) => ({
    label: level.label,
    value: level.value,
  }));

  return (
    <div className="h-full w-full overflow-y-auto">
      {/* Header */}
      <div className="border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-5">
          <Link
            to="/app/teacher-lounge/writing-lessons"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to library
          </Link>
          <h1 className="text-2xl font-bold">Generate New Lesson</h1>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-screen-lg p-5 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Generation Form */}
          <div className="space-y-6">
            <div className="rounded-lg border bg-card p-6">
              <h2 className="font-medium mb-4">Lesson Settings</h2>
              <form {...form.getFormProps()} className="space-y-4">
                <FormSelect
                  scope={form.scope('topic')}
                  label="Topic"
                  options={topicOptions}
                  placeholder="Select a writing topic..."
                />

                <FormSelect
                  scope={form.scope('gradeLevel')}
                  label="Grade Level"
                  options={gradeLevelOptions}
                />

                <FormInput
                  scope={form.scope('customFocus')}
                  label="Custom Focus (Optional)"
                  placeholder="e.g., 'Focus on academic writing' or 'Use modern examples'"
                />

                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!form.value('topic') || isGenerating}
                  className="w-full gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Lesson
                    </>
                  )}
                </Button>
              </form>
            </div>

            {fetcher.data && 'error' in fetcher.data && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">{fetcher.data.error}</p>
              </div>
            )}
          </div>

          {/* Preview/Edit */}
          <div className="space-y-6">
            {generatedContent ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-medium">Preview & Edit</h2>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(!isEditing)}
                    >
                      {isEditing ? 'Preview' : 'Edit'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="gap-2"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save to Library
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border bg-card p-6">
                  {isEditing ? (
                    <Textarea
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      className="min-h-[600px] font-mono text-sm"
                    />
                  ) : (
                    <LessonContent lesson={parseLesson(generatedContent)} />
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-lg border-2 border-dashed p-12 text-center text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a topic and click "Generate Lesson" to create your lesson</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
