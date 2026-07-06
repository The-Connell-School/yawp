import {
  data as dataResponse,
  Form,
  Link,
  redirect,
  useLoaderData,
} from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BotIcon,
  ClipboardCheckIcon,
  HistoryIcon,
  SaveIcon,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
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

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function objectArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function gradingCategoriesFrom(value: unknown) {
  if (!isRecord(value)) return [];
  return objectArray(value.categories).map((category) => ({
    key: stringValue(category.key),
    label: stringValue(category.label, stringValue(category.key, 'Category')),
    score: numberValue(category.score),
    comment: stringValue(category.comment),
  }));
}

function tutorResponsesFrom(value: unknown) {
  if (!isRecord(value)) return [];
  return objectArray(value.responses).map((response, index) => ({
    key: `${stringValue(response.moduleId, 'module')}:${stringValue(
      response.instructionId,
      String(index)
    )}`,
    moduleTitle: stringValue(response.moduleTitle, 'Tutor'),
    instructionTitle: stringValue(response.instructionTitle, 'Response'),
    response:
      stringValue(response.response) || stringValue(response.rawResponse),
  }));
}

function EvaluationResult({ result }: { result: unknown }) {
  if (!isRecord(result)) {
    return (
      <p className="text-sm text-muted-foreground">
        Run a test to see tutor and grading feedback here.
      </p>
    );
  }

  const mode = stringValue(result.mode);
  const gradingAssistant = isRecord(result.gradingAssistant)
    ? result.gradingAssistant
    : {};
  const tutor = isRecord(result.tutor) ? result.tutor : {};
  const rawGrading = stringValue(gradingAssistant.rawResponse);
  const parsedLiveGrading = rawGrading ? parseJsonObject(rawGrading) : null;
  const gradingSource =
    parsedLiveGrading ?? (isRecord(gradingAssistant) ? gradingAssistant : {});
  const gradingCategories = gradingCategoriesFrom(gradingSource);
  const overallComment =
    stringValue((gradingSource as Record<string, unknown>).overallComment) ||
    rawGrading;
  const tutorResponses = tutorResponsesFrom(tutor);

  return (
    <div className="space-y-6" aria-live="polite">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ClipboardCheckIcon className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">Grading feedback</h3>
          {mode === 'live-workbench-llm' ? (
            <Badge variant="info-soft" size="sm">
              Live AI
            </Badge>
          ) : (
            <Badge variant="secondary" size="sm">
              Safe test
            </Badge>
          )}
        </div>
        {overallComment ? (
          <p className="rounded-md border bg-muted/20 p-3 text-sm leading-6 whitespace-pre-wrap">
            {overallComment}
          </p>
        ) : null}
        {gradingCategories.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {gradingCategories.map((category) => (
              <div key={category.key || category.label} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{category.label}</p>
                  {category.score === null ? null : (
                    <Badge variant="outline" size="sm">
                      {category.score}
                    </Badge>
                  )}
                </div>
                {category.comment ? (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {category.comment}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BotIcon className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">Tutor feedback</h3>
        </div>
        {tutorResponses.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
            No tutor feedback was returned for this run.
          </p>
        ) : (
          <div className="space-y-3">
            {tutorResponses.map((response) => (
              <div key={response.key} className="rounded-md border p-3">
                <p className="text-sm font-medium">
                  {response.moduleTitle} - {response.instructionTitle}
                </p>
                <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                  {response.response}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
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
  const [sandboxStudentFirstName, setSandboxStudentFirstName] = useState(
    controls.studentFirstName
  );
  const [sandboxSampleEssay, setSandboxSampleEssay] = useState(
    controls.sampleEssay
  );
  const [sandboxStrictnessLevel, setSandboxStrictnessLevel] = useState(
    controls.strictnessLevel
  );
  const selectedRunNotes = stringValue(selectedRun?.notes);
  const selectedRunResultJson = selectedRun?.resultJson;
  const rubricCategories = workbench.assignmentType.rubricCategories;
  const latestVersion = assignmentType.aiVersions[0] ?? null;

  useEffect(() => {
    setSandboxStudentFirstName(controls.studentFirstName);
    setSandboxSampleEssay(controls.sampleEssay);
    setSandboxStrictnessLevel(controls.strictnessLevel);
  }, [
    controls.studentFirstName,
    controls.sampleEssay,
    controls.strictnessLevel,
  ]);

  return (
    <div className="mx-auto max-w-6xl px-3 py-5 pb-16 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div className="min-w-0 space-y-4">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to={`/app/admin/assignment-types/${assignmentType.id}`}>
              <ArrowLeft className="mr-2 size-4 shrink-0" />
              Back
            </Link>
          </Button>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Assignment type test area
            </p>
            <h1 className="mt-1 text-3xl font-semibold">
              Sandbox: {assignmentType.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Try this assignment type with sample writing before using it with
              students. Tests saved here do not create submissions, grades, or
              tutor messages for real students.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" size="sm">
            {selectedVersion
              ? `Replaying v${selectedVersion.versionNumber}`
              : 'Current version'}
          </Badge>
          <Badge variant="outline" size="sm">
            {workbench.assignmentType.rubricCategories.length} rubric categories
          </Badge>
          <Badge variant="outline" size="sm">
            {workbench.tutorPreviews.length} tutor moments
          </Badge>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Test draft</CardTitle>
              <CardDescription>
                Paste a representative piece of writing and choose how strict the
                grading assistant should be for this test.
              </CardDescription>
            </CardHeader>
            <CardContent>
            <Form
              method="get"
              preventScrollReset
              className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_170px]"
            >
              {selectedVersion ? (
                <input type="hidden" name="versionId" value={selectedVersion.id} />
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="studentFirstName">Student name</Label>
                <Input
                  id="studentFirstName"
                  name="studentFirstName"
                  value={sandboxStudentFirstName}
                  onChange={(event) =>
                    setSandboxStudentFirstName(event.currentTarget.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sampleEssay">Test draft</Label>
                <Textarea
                  id="sampleEssay"
                  name="sampleEssay"
                  rows={4}
                  value={sandboxSampleEssay}
                  onChange={(event) =>
                    setSandboxSampleEssay(event.currentTarget.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="strictnessLevel">Strictness</Label>
                <select
                  id="strictnessLevel"
                  name="strictnessLevel"
                  value={sandboxStrictnessLevel}
                  onChange={(event) =>
                    setSandboxStrictnessLevel(
                      parseGradingAssistantStrictnessLevel(
                        event.currentTarget.value
                      ) ?? DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
                    )
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {gradingAssistantStrictnessOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" className="w-full">
                  Update draft
                </Button>
              </div>
            </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Tutor sandbox</CardTitle>
                  <CardDescription>
                    Check how the tutor will guide a student through this
                    assignment type.
                  </CardDescription>
                </div>
                <Badge variant="outline" size="sm">
                  {workbench.tutorPreviews.length} tutor moments
                </Badge>
              </div>
            </CardHeader>
            <CardContent>

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
                      <div className="rounded-md bg-muted/30 p-3 text-sm leading-6">
                        <p className="font-medium">Student instruction</p>
                        <p className="mt-1 text-muted-foreground">
                          {preview.instructionPrompt}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Grading sandbox</CardTitle>
                  <CardDescription>
                    Check the rubric categories and run this sample draft through
                    the grading assistant.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" size="sm">
                    {workbench.gradingPreview.strictnessLabel}
                  </Badge>
                  <Badge variant="outline" size="sm">
                    Scores {workbench.gradingPreview.minScore}-
                    {workbench.gradingPreview.maxScore}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {rubricCategories.length === 0 ? (
                <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
                  No rubric categories have been configured yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {rubricCategories.map((category) => (
                    <div key={category.key} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{category.label}</p>
                        <Badge variant="outline" size="sm">
                          {Math.round(category.weight * 100)}%
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {category.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedRun ? (
            <Card>
              <CardHeader>
                <CardTitle>Latest result</CardTitle>
                <CardDescription>
                  {stringValue(selectedRun.label, 'Untitled test')}
                  {selectedRunNotes ? ` - ${selectedRunNotes}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EvaluationResult result={selectedRunResultJson} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <SaveIcon className="size-4 text-muted-foreground" />
                <CardTitle>Run a test</CardTitle>
              </div>
              <CardDescription>
                Safe tests use predictable sample output. Live AI tests call the
                model with this draft.
              </CardDescription>
            </CardHeader>
            <CardContent>
            <Form method="post" className="space-y-3">
              {selectedVersion ? (
                <input type="hidden" name="versionId" value={selectedVersion.id} />
              ) : null}
              <input
                type="hidden"
                name="studentFirstName"
                value={sandboxStudentFirstName}
              />
              <input
                type="hidden"
                name="strictnessLevel"
                value={sandboxStrictnessLevel}
              />
              <input type="hidden" name="sampleEssay" value={sandboxSampleEssay} />
              <div className="space-y-2">
                <Label htmlFor="evaluationLabel">Test name</Label>
                <Input
                  id="evaluationLabel"
                  name="label"
                  placeholder="Advanced thesis check"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="evaluationNotes">What are you checking?</Label>
                <Textarea
                  id="evaluationNotes"
                  name="notes"
                  rows={3}
                  placeholder="Example: Does the tutor notice the thesis is specific?"
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
                  Run safe test
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
                  Save test for later
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                This is a safe sandbox. It will not change student documents,
                submissions, grades, or tutor conversations.
              </p>
            </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Saved tests</CardTitle>
              <CardDescription>
                Reopen earlier checks for this assignment type.
              </CardDescription>
            </CardHeader>
            <CardContent>
            {assignmentType.aiEvaluationRuns.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
                No saved tests yet.
              </div>
            ) : (
              <ol className="space-y-3">
                {assignmentType.aiEvaluationRuns.map((run) => (
                  <li key={run.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {run.label ?? 'Untitled test'}
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <HistoryIcon className="size-4 text-muted-foreground" />
                <CardTitle>Version history</CardTitle>
              </div>
              <CardDescription>
                Replay a prior configuration if a newer version needs checking.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assignmentType.aiVersions.length === 0 ? (
                <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
                  No AI snapshots have been recorded yet.
                </div>
              ) : (
                <ol className="space-y-3">
                  {assignmentType.aiVersions.map((version) => (
                    <li key={version.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">
                            v{version.versionNumber}
                            {latestVersion?.id === version.id ? ' - Current' : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {version.changeSummary ?? 'AI configuration updated'}
                          </p>
                        </div>
                        <Badge variant="secondary" size="sm">
                          {formatWorkbenchDate(version.createdAt)}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <Button type="button" variant="outline" size="sm" asChild>
                          <a
                            href={`/app/admin/assignment-types/${assignmentType.id}/ai-workbench?versionId=${version.id}`}
                          >
                            Replay
                          </a>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {selectedVersion && versionComparison?.hasChanges ? (
                <div className="mt-4 rounded-md border bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">
                  You are replaying v{selectedVersion.versionNumber}. The
                  current version has changes to compare against this test.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
