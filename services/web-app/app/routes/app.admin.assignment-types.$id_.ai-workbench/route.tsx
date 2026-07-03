import { data as dataResponse, Form, Link, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import {
  ArrowLeft,
  BotIcon,
  ClipboardCheckIcon,
  Layers3Icon,
} from 'lucide-react';
import { AssignmentTypeAiHistorySection } from '~/components/admin/assignment-type-ai-history-section';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import {
  buildAssignmentTypeAiWorkbench,
  DEFAULT_WORKBENCH_SAMPLE_ESSAY,
  DEFAULT_WORKBENCH_STUDENT_FIRST_NAME,
  type AssignmentTypeAiWorkbench,
} from '~/domain/assignment-types/assignment-type-ai-workbench.server';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  gradingAssistantStrictnessOptions,
  parseGradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const assignmentTypeId = params.id;
  if (!assignmentTypeId) {
    throw new Response('Not Found', { status: 404 });
  }

  const assignmentType = await prisma.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    include: {
      assignmentModules: {
        where: { deletedAt: null },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        include: {
          instructions: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              title: true,
              position: true,
              prompt: true,
              tutorInstructions: true,
            },
          },
        },
      },
      aiVersions: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          versionNumber: true,
          changeSource: true,
          changeSummary: true,
          createdAt: true,
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!assignmentType) {
    throw new Response('Not Found', { status: 404 });
  }

  const url = new URL(request.url);
  const studentFirstName =
    url.searchParams.get('studentFirstName')?.trim() ||
    DEFAULT_WORKBENCH_STUDENT_FIRST_NAME;
  const sampleEssay =
    url.searchParams.get('sampleEssay')?.trim() || DEFAULT_WORKBENCH_SAMPLE_ESSAY;
  const strictnessLevel =
    parseGradingAssistantStrictnessLevel(
      url.searchParams.get('strictnessLevel')
    ) ?? DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL;
  const workbench = buildAssignmentTypeAiWorkbench({
    assignmentType,
    sampleEssay,
    studentFirstName,
    strictnessLevel,
  });

  return dataResponse({
    assignmentType,
    workbench,
    controls: { studentFirstName, sampleEssay, strictnessLevel },
  });
}

function PromptBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <pre className="max-h-[360px] overflow-auto rounded-md border bg-muted/30 p-4 text-xs leading-relaxed whitespace-pre-wrap">
        {value || 'No prompt content.'}
      </pre>
    </div>
  );
}

function instructionModeLabel(
  mode: AssignmentTypeAiWorkbench['gradingPreview']['instructions']['mode']
) {
  if (mode === 'unified') return 'Unified instructions';
  if (mode === 'preset') return 'Preset instructions';
  return 'Split instructions';
}

export default function AssignmentTypeAiWorkbenchRoute() {
  const { assignmentType, workbench, controls } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-6xl px-3 py-5 pb-16 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div className="min-w-0 space-y-5">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to={`/app/admin/assignment-types/${assignmentType.id}`}>
              <ArrowLeft className="mr-2 size-4 shrink-0" />
              Back
            </Link>
          </Button>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Assignment type AI workbench
            </p>
            <h1 className="mt-1 text-3xl font-semibold">
              {assignmentType.title}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" size="sm">
            Grading v{workbench.assignmentType.gradingAssistantVersion}
          </Badge>
          <Badge variant="outline" size="sm">
            {workbench.assignmentType.source}
          </Badge>
          <Badge variant="outline" size="sm">
            {workbench.assignmentType.rubricCategories.length} rubric categories
          </Badge>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="border-t pt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardCheckIcon className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Grading assistant</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" size="sm">
                  {workbench.gradingPreview.strictnessLabel}
                </Badge>
                <Badge variant="outline" size="sm">
                  {workbench.gradingPreview.minScore}-
                  {workbench.gradingPreview.maxScore}
                </Badge>
                <Badge variant="outline" size="sm">
                  {instructionModeLabel(workbench.gradingPreview.instructions.mode)}
                </Badge>
              </div>
            </div>
            <Form
              method="get"
              preventScrollReset
              className="mb-5 grid gap-4 rounded-md border p-4 lg:grid-cols-[180px_minmax(0,1fr)_160px]"
            >
              <div className="space-y-2">
                <Label htmlFor="studentFirstName">Student name</Label>
                <Input
                  id="studentFirstName"
                  name="studentFirstName"
                  defaultValue={controls.studentFirstName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sampleEssay">Sample essay</Label>
                <Textarea
                  id="sampleEssay"
                  name="sampleEssay"
                  rows={4}
                  defaultValue={controls.sampleEssay}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="strictnessLevel">Strictness</Label>
                <select
                  id="strictnessLevel"
                  name="strictnessLevel"
                  defaultValue={controls.strictnessLevel}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {gradingAssistantStrictnessOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" className="w-full">
                  Update preview
                </Button>
              </div>
            </Form>
            <div className="grid gap-4 xl:grid-cols-2">
              <PromptBlock
                label="System prompt"
                value={workbench.gradingPreview.system}
              />
              <PromptBlock
                label="User prompt"
                value={workbench.gradingPreview.userPrompt}
              />
            </div>
          </section>

          <section className="border-t pt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BotIcon className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Tutor</h2>
              </div>
              <Badge variant="outline" size="sm">
                {workbench.tutorPreviews.length} previews
              </Badge>
            </div>

            {workbench.tutorPreviews.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
                No tutor modules have been configured yet.
              </div>
            ) : (
              <div className="space-y-4">
                {workbench.tutorPreviews.map((preview) => (
                  <div
                    key={`${preview.moduleId}:${preview.instructionId ?? 'module'}`}
                    className="rounded-md border p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {preview.moduleTitle}
                        </p>
                        <h3 className="text-base font-semibold">
                          {preview.instructionTitle}
                        </h3>
                      </div>
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link
                          to={`/app/admin/assignment-types/${assignmentType.id}/modules/${preview.moduleId}`}
                        >
                          Edit module
                        </Link>
                      </Button>
                    </div>
                    {preview.instructionPrompt ? (
                      <PromptBlock
                        label="Student-facing instruction"
                        value={preview.instructionPrompt}
                      />
                    ) : null}
                    <div className="mt-4">
                      <PromptBlock
                        label="Tutor system prompt"
                        value={preview.systemPrompt}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="border-t pt-6">
            <div className="mb-3 flex items-center gap-2">
              <Layers3Icon className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Current shape</h2>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border px-3 py-2">
                <dt className="text-muted-foreground">Modules</dt>
                <dd className="text-lg font-semibold">
                  {assignmentType.assignmentModules.length}
                </dd>
              </div>
              <div className="rounded-md border px-3 py-2">
                <dt className="text-muted-foreground">Snapshots</dt>
                <dd className="text-lg font-semibold">
                  {assignmentType.aiVersions.length}
                </dd>
              </div>
            </dl>
          </section>

          <section className="border-t pt-6">
            <AssignmentTypeAiHistorySection
              assignmentTypeId={assignmentType.id}
              aiVersions={assignmentType.aiVersions}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
