import {
  data as dataResponse,
  Form,
  Link,
  redirect,
  useLoaderData,
} from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import {
  ArrowLeft,
  BotIcon,
  ClipboardCheckIcon,
  SaveIcon,
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
  buildDeterministicAssignmentTypeAiEvaluationResult,
  buildLiveAssignmentTypeAiEvaluationResult,
} from '~/domain/assignment-types/assignment-type-ai-evaluation-run.server';
import {
  assignmentTypeAiSnapshotToWorkbenchInput,
  buildAssignmentTypeAiWorkbench,
  compareAssignmentTypeAiWorkbenches,
  DEFAULT_WORKBENCH_SAMPLE_ESSAY,
  DEFAULT_WORKBENCH_STUDENT_FIRST_NAME,
  type AssignmentTypeAiWorkbench,
} from '~/domain/assignment-types/assignment-type-ai-workbench.server';
import type { AssignmentTypeAiSnapshot } from '~/domain/assignment-types/assignment-type-ai-version.server';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  gradingAssistantStrictnessOptions,
  parseGradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

function loadAssignmentTypeForWorkbench(assignmentTypeId: string) {
  return prisma.assignmentType.findUnique({
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
          snapshotJson: true,
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      aiEvaluationRuns: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          label: true,
          notes: true,
          agentKind: true,
          status: true,
          studentFirstName: true,
          strictnessLevel: true,
          sampleInput: true,
          promptSnapshotJson: true,
          resultJson: true,
          createdAt: true,
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          assignmentTypeAiVersion: {
            select: {
              id: true,
              versionNumber: true,
            },
          },
        },
      },
    },
  });
}

function parseSandboxControlsFromSearchParams(searchParams: URLSearchParams) {
  const studentFirstName =
    searchParams.get('studentFirstName')?.trim() ||
    DEFAULT_WORKBENCH_STUDENT_FIRST_NAME;
  const sampleEssay =
    searchParams.get('sampleEssay')?.trim() || DEFAULT_WORKBENCH_SAMPLE_ESSAY;
  const strictnessLevel =
    parseGradingAssistantStrictnessLevel(searchParams.get('strictnessLevel')) ??
    DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL;

  return { studentFirstName, sampleEssay, strictnessLevel };
}

function parseSandboxControlsFromFormData(formData: FormData) {
  const studentFirstName =
    formData.get('studentFirstName')?.toString().trim() ||
    DEFAULT_WORKBENCH_STUDENT_FIRST_NAME;
  const sampleEssay =
    formData.get('sampleEssay')?.toString().trim() ||
    DEFAULT_WORKBENCH_SAMPLE_ESSAY;
  const strictnessLevel =
    parseGradingAssistantStrictnessLevel(
      formData.get('strictnessLevel')?.toString()
    ) ?? DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL;

  return { studentFirstName, sampleEssay, strictnessLevel };
}

function buildPromptSnapshot({
  workbench,
  controls,
}: {
  workbench: AssignmentTypeAiWorkbench;
  controls: ReturnType<typeof parseSandboxControlsFromFormData>;
}) {
  return {
    schemaVersion: 1,
    assignmentType: workbench.assignmentType,
    controls,
    gradingPreview: workbench.gradingPreview,
    tutorPreviews: workbench.tutorPreviews,
  };
}

function selectedVersionSummary(
  version:
    | {
        id: string;
        versionNumber: number;
        changeSummary: string | null;
        createdAt: Date;
      }
    | null
) {
  return version
    ? {
        id: version.id,
        versionNumber: version.versionNumber,
        changeSummary: version.changeSummary,
        createdAt: version.createdAt,
      }
    : null;
}

function stripVersionSnapshots<
  T extends {
    aiVersions: Array<Record<string, unknown> & { snapshotJson?: unknown }>;
    aiEvaluationRuns: Array<
      Record<string, unknown> & {
        promptSnapshotJson?: unknown;
        resultJson?: unknown;
      }
    >;
  },
>(assignmentType: T) {
  return {
    ...assignmentType,
    aiVersions: assignmentType.aiVersions.map(({ snapshotJson: _snapshotJson, ...row }) => row),
    aiEvaluationRuns: assignmentType.aiEvaluationRuns.map(
      ({
        promptSnapshotJson: _promptSnapshotJson,
        resultJson: _resultJson,
        ...row
      }) => row
    ),
  };
}

function selectedRunSummary(
  run:
    | (Record<string, unknown> & {
        id: string;
        promptSnapshotJson?: unknown;
      })
    | null
) {
  return run ? { ...run } : null;
}

function workbenchInputFromSelection({
  assignmentType,
  selectedVersion,
}: {
  assignmentType: Parameters<typeof buildAssignmentTypeAiWorkbench>[0]['assignmentType'];
  selectedVersion: { snapshotJson?: unknown } | null;
}) {
  if (selectedVersion?.snapshotJson) {
    return assignmentTypeAiSnapshotToWorkbenchInput(
      selectedVersion.snapshotJson as AssignmentTypeAiSnapshot
    );
  }

  return assignmentType;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const assignmentTypeId = params.id;
  if (!assignmentTypeId) {
    throw new Response('Not Found', { status: 404 });
  }

  const assignmentType = await loadAssignmentTypeForWorkbench(assignmentTypeId);

  if (!assignmentType) {
    throw new Response('Not Found', { status: 404 });
  }

  const url = new URL(request.url);
  const controls = parseSandboxControlsFromSearchParams(url.searchParams);
  const selectedVersionId = url.searchParams.get('versionId')?.trim() || null;
  const selectedVersion =
    assignmentType.aiVersions.find((version) => version.id === selectedVersionId) ??
    null;
  const selectedRunId = url.searchParams.get('runId')?.trim() || null;
  const selectedRun =
    assignmentType.aiEvaluationRuns.find((run) => run.id === selectedRunId) ??
    null;
  const workbench = buildAssignmentTypeAiWorkbench({
    assignmentType: workbenchInputFromSelection({
      assignmentType,
      selectedVersion,
    }),
    ...controls,
  });
  const currentWorkbench = selectedVersion
    ? buildAssignmentTypeAiWorkbench({
        assignmentType,
        ...controls,
      })
    : workbench;
  const versionComparison = selectedVersion
    ? compareAssignmentTypeAiWorkbenches({
        current: currentWorkbench,
        baseline: workbench,
      })
    : null;

  return dataResponse({
    assignmentType: stripVersionSnapshots(assignmentType),
    workbench,
    selectedVersion: selectedVersionSummary(selectedVersion),
    selectedRun: selectedRunSummary(selectedRun),
    versionComparison,
    controls,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const assignmentTypeId = params.id;
  if (!assignmentTypeId) {
    throw new Response('Not Found', { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get('intent');
  if (
    intent !== 'saveEvaluationRun' &&
    intent !== 'runEvaluation' &&
    intent !== 'runLiveEvaluation'
  ) {
    return dataResponse({ status: 'error' }, { status: 400 });
  }

  const assignmentType = await loadAssignmentTypeForWorkbench(assignmentTypeId);
  if (!assignmentType) {
    throw new Response('Not Found', { status: 404 });
  }

  const controls = parseSandboxControlsFromFormData(formData);
  const selectedVersionId = formData.get('versionId')?.toString().trim() || null;
  const selectedVersion =
    assignmentType.aiVersions.find((version) => version.id === selectedVersionId) ??
    null;
  const workbench = buildAssignmentTypeAiWorkbench({
    assignmentType: workbenchInputFromSelection({
      assignmentType,
      selectedVersion,
    }),
    ...controls,
  });
  const label = formData.get('label')?.toString().trim() || null;
  const notes = formData.get('notes')?.toString().trim() || null;
  const latestVersion = assignmentType.aiVersions[0] ?? null;
  const isFixtureRun = intent === 'runEvaluation';
  const isLiveRun = intent === 'runLiveEvaluation';
  const isCompletedRun = isFixtureRun || isLiveRun;
  const resultJson = isFixtureRun
    ? buildDeterministicAssignmentTypeAiEvaluationResult({
        workbench,
        sampleInput: controls.sampleEssay,
        studentFirstName: controls.studentFirstName,
      })
    : isLiveRun
      ? await buildLiveAssignmentTypeAiEvaluationResult({
          workbench,
          sampleInput: controls.sampleEssay,
        })
    : undefined;

  const run = await prisma.assignmentTypeAiEvaluationRun.create({
    data: {
      assignmentTypeId,
      assignmentTypeAiVersionId: selectedVersion?.id ?? latestVersion?.id ?? null,
      createdByUserId: admin.id,
      agentKind: isLiveRun
        ? 'workbench-live'
        : isFixtureRun
          ? 'workbench-fixture'
          : 'workbench-preview',
      status: isCompletedRun ? 'completed' : 'saved',
      label,
      notes,
      studentFirstName: controls.studentFirstName,
      strictnessLevel: controls.strictnessLevel,
      sampleInput: controls.sampleEssay,
      promptSnapshotJson: buildPromptSnapshot({ workbench, controls }),
      ...(resultJson ? { resultJson } : {}),
    },
  });

  const searchParams = new URLSearchParams({
    studentFirstName: controls.studentFirstName,
    strictnessLevel: controls.strictnessLevel,
    sampleEssay: controls.sampleEssay,
  });
  searchParams.set(isCompletedRun ? 'runId' : 'savedRun', run.id);
  if (selectedVersion) {
    searchParams.set('versionId', selectedVersion.id);
  }

  return redirect(
    `/app/admin/assignment-types/${assignmentTypeId}/ai-workbench?${searchParams}`
  );
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

function formatWorkbenchDate(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function runActorLabel(run: {
  createdByUser: { name: string | null; email: string | null } | null;
}) {
  return run.createdByUser?.name ?? run.createdByUser?.email ?? 'Unknown admin';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function nestedString(value: unknown, path: string[]) {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return '';
    current = current[segment];
  }

  return typeof current === 'string' ? current : '';
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function tutorSnapshotPreviews(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.tutorPreviews)) return [];

  return value.tutorPreviews
    .filter(isRecord)
    .map((preview, index) => ({
      key: `${preview.moduleId ?? 'module'}:${preview.instructionId ?? index}`,
      label: [
        typeof preview.moduleTitle === 'string' ? preview.moduleTitle : null,
        typeof preview.instructionTitle === 'string'
          ? preview.instructionTitle
          : null,
      ]
        .filter(Boolean)
        .join(' - '),
      systemPrompt:
        typeof preview.systemPrompt === 'string' ? preview.systemPrompt : '',
    }))
    .filter((preview) => preview.systemPrompt);
}

function InlineChangeList({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }

  return <span>{values.join(', ')}</span>;
}

export default function AssignmentTypeAiWorkbenchRoute() {
  const {
    assignmentType,
    workbench,
    selectedVersion,
    selectedRun,
    versionComparison,
    controls,
  } = useLoaderData<typeof loader>();
  const selectedRunSnapshot = selectedRun?.promptSnapshotJson;
  const selectedRunTutorPreviews = tutorSnapshotPreviews(selectedRunSnapshot);
  const selectedRunNotes = stringValue(selectedRun?.notes);
  const selectedRunResultJson = selectedRun?.resultJson;

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
          {selectedVersion ? (
            <Badge variant="info-soft" size="sm">
              Replaying v{selectedVersion.versionNumber}
            </Badge>
          ) : null}
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
              {selectedVersion ? (
                <input type="hidden" name="versionId" value={selectedVersion.id} />
              ) : null}
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
              <div className="rounded-md border px-3 py-2">
                <dt className="text-muted-foreground">Saved runs</dt>
                <dd className="text-lg font-semibold">
                  {assignmentType.aiEvaluationRuns.length}
                </dd>
              </div>
            </dl>
          </section>

          {selectedVersion && versionComparison ? (
            <section className="border-t pt-6">
              <h2 className="mb-3 text-lg font-semibold">Version comparison</h2>
              <div className="space-y-3 rounded-md border p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Grading prompt</span>
                  <Badge
                    variant={
                      versionComparison.gradingPromptChanged
                        ? 'warning-soft'
                        : 'secondary'
                    }
                    size="sm"
                  >
                    {versionComparison.gradingPromptChanged
                      ? 'Changed'
                      : 'Same'}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Rubric</p>
                  <p className="text-muted-foreground">
                    Added:{' '}
                    <InlineChangeList
                      values={versionComparison.rubricCategories.added}
                    />
                  </p>
                  <p className="text-muted-foreground">
                    Removed:{' '}
                    <InlineChangeList
                      values={versionComparison.rubricCategories.removed}
                    />
                  </p>
                  <p className="text-muted-foreground">
                    Changed:{' '}
                    <InlineChangeList
                      values={versionComparison.rubricCategories.changed}
                    />
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Tutor prompts</p>
                  <p className="text-muted-foreground">
                    Added:{' '}
                    <InlineChangeList values={versionComparison.tutorPrompts.added} />
                  </p>
                  <p className="text-muted-foreground">
                    Removed:{' '}
                    <InlineChangeList
                      values={versionComparison.tutorPrompts.removed}
                    />
                  </p>
                  <p className="text-muted-foreground">
                    Changed:{' '}
                    <InlineChangeList
                      values={versionComparison.tutorPrompts.changed}
                    />
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="border-t pt-6">
            <div className="mb-3 flex items-center gap-2">
              <SaveIcon className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Evaluation case</h2>
            </div>
            <Form method="post" className="space-y-3 rounded-md border p-4">
              {selectedVersion ? (
                <input type="hidden" name="versionId" value={selectedVersion.id} />
              ) : null}
              <input
                type="hidden"
                name="studentFirstName"
                value={controls.studentFirstName}
              />
              <input
                type="hidden"
                name="strictnessLevel"
                value={controls.strictnessLevel}
              />
              <input type="hidden" name="sampleEssay" value={controls.sampleEssay} />
              <div className="space-y-2">
                <Label htmlFor="evaluationLabel">Label</Label>
                <Input
                  id="evaluationLabel"
                  name="label"
                  placeholder="Advanced thesis check"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="evaluationNotes">Notes</Label>
                <Textarea
                  id="evaluationNotes"
                  name="notes"
                  rows={3}
                  placeholder="What this case should prove..."
                />
              </div>
              <div className="grid gap-2">
                <Button
                  type="submit"
                  name="intent"
                  value="runEvaluation"
                  size="sm"
                  className="w-full"
                >
                  Run fixture
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="runLiveEvaluation"
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Run live AI
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="saveEvaluationRun"
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Save case
                </Button>
              </div>
            </Form>
          </section>

          <section className="border-t pt-6">
            <h2 className="mb-3 text-lg font-semibold">Saved runs</h2>
            {assignmentType.aiEvaluationRuns.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
                No saved evaluation cases yet.
              </div>
            ) : (
              <ol className="space-y-3">
                {assignmentType.aiEvaluationRuns.map((run) => (
                  <li key={run.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {run.label ?? 'Untitled evaluation case'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {runActorLabel(run)}
                          {run.assignmentTypeAiVersion
                            ? ` on v${run.assignmentTypeAiVersion.versionNumber}`
                            : ''}
                        </p>
                      </div>
                      <Badge variant="secondary" size="sm">
                        {run.strictnessLevel ?? 'preview'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatWorkbenchDate(run.createdAt)}
                    </p>
                    <div className="mt-3">
                      <Button type="button" variant="outline" size="sm" asChild>
                        <a
                          href={`/app/admin/assignment-types/${assignmentType.id}/ai-workbench?runId=${run.id}`}
                        >
                          View
                        </a>
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {selectedRun ? (
            <section className="border-t pt-6">
              <h2 className="mb-3 text-lg font-semibold">Selected run</h2>
              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <p className="text-sm font-medium">
                    {stringValue(
                      selectedRun.label,
                      'Untitled evaluation case'
                    )}
                  </p>
                  {selectedRunNotes ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedRunNotes}
                    </p>
                  ) : null}
                </div>
                <PromptBlock
                  label="Saved sample"
                  value={stringValue(selectedRun.sampleInput)}
                />
                <PromptBlock
                  label="Saved grading system prompt"
                  value={nestedString(selectedRunSnapshot, [
                    'gradingPreview',
                    'system',
                  ])}
                />
                <PromptBlock
                  label="Saved grading user prompt"
                  value={nestedString(selectedRunSnapshot, [
                    'gradingPreview',
                    'userPrompt',
                  ])}
                />
                {selectedRunTutorPreviews.map((preview) => (
                  <PromptBlock
                    key={preview.key}
                    label={`Saved tutor prompt: ${preview.label || 'Tutor preview'}`}
                    value={preview.systemPrompt}
                  />
                ))}
                {selectedRunResultJson ? (
                  <PromptBlock
                    label="Evaluation result"
                    value={JSON.stringify(selectedRunResultJson, null, 2)}
                  />
                ) : null}
              </div>
            </section>
          ) : null}

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
