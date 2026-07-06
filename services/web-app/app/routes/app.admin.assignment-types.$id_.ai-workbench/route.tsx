import {
  data as dataResponse,
  Form,
  Link,
  redirect,
  useLoaderData,
  useSearchParams,
} from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { useEffect, useState } from 'react';
import { ArrowLeft, BotIcon, ClipboardCheckIcon } from 'lucide-react';
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
  version: {
    id: string;
    versionNumber: number;
    changeSummary: string | null;
    createdAt: Date;
  } | null
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
    aiVersions: assignmentType.aiVersions.map(
      ({ snapshotJson: _snapshotJson, ...row }) => row
    ),
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
  assignmentType: Parameters<
    typeof buildAssignmentTypeAiWorkbench
  >[0]['assignmentType'];
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
    assignmentType.aiVersions.find(
      (version) => version.id === selectedVersionId
    ) ?? null;
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
  const mode =
    formData.get('mode')?.toString() === 'grading' ? 'grading' : 'tutor';
  const selectedVersionId =
    formData.get('versionId')?.toString().trim() || null;
  const selectedVersion =
    assignmentType.aiVersions.find(
      (version) => version.id === selectedVersionId
    ) ?? null;
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
      assignmentTypeAiVersionId:
        selectedVersion?.id ?? latestVersion?.id ?? null,
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
  if (mode === 'grading') {
    searchParams.set('mode', 'grading');
  }
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

function gradingFeedbackFrom(result: unknown) {
  if (!isRecord(result)) {
    return { categories: [], overallComment: '' };
  }
  const gradingAssistant = isRecord(result.gradingAssistant)
    ? result.gradingAssistant
    : {};
  const rawGrading = stringValue(gradingAssistant.rawResponse);
  const parsedLiveGrading = rawGrading ? parseJsonObject(rawGrading) : null;
  const gradingSource =
    parsedLiveGrading ?? (isRecord(gradingAssistant) ? gradingAssistant : {});
  return {
    categories: gradingCategoriesFrom(gradingSource),
    overallComment:
      stringValue((gradingSource as Record<string, unknown>).overallComment) ||
      rawGrading,
  };
}

function TutorFeedback({ result }: { result: unknown }) {
  const tutor = isRecord(result) && isRecord(result.tutor) ? result.tutor : {};
  const tutorResponses = tutorResponsesFrom(tutor);

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center gap-2">
        <BotIcon className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Tutor feedback</h2>
      </div>
      {tutorResponses.length === 0 ? (
        <p className="rounded-xl rounded-bl-none bg-ring/20 px-3 py-2 text-sm">
          Ask the tutor a question to see how this assignment type responds.
        </p>
      ) : (
        tutorResponses.map((response) => (
          <div
            key={response.key}
            className="mr-auto max-w-[92%] rounded-xl rounded-bl-none bg-ring/20 px-3 py-2"
          >
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs font-bold">Tutor</p>
              <p className="text-xs text-muted-foreground/80">
                {response.moduleTitle} - {response.instructionTitle}
              </p>
            </div>
            <p className="whitespace-pre-wrap">{response.response}</p>
          </div>
        ))
      )}
    </div>
  );
}

function GradingFeedback({ result }: { result: unknown }) {
  const { categories, overallComment } = gradingFeedbackFrom(result);

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="space-y-2">
        <Label htmlFor="overall-comment">Overall Feedback</Label>
        <Textarea
          id="overall-comment"
          value={overallComment}
          readOnly
          rows={4}
          placeholder="Run grading assistant suggestions to populate this field."
        />
      </div>
      <div className="space-y-3">
        <div className="text-sm font-medium">Rubric</div>
        {categories.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
            Run grading assistant suggestions to populate rubric scores.
          </p>
        ) : (
          categories.map((category) => (
            <div
              key={category.key || category.label}
              className="rounded-lg border p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{category.label}</p>
                <span className="text-xs font-medium text-muted-foreground">
                  {category.score === null ? 'Not scored' : `${category.score}`}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {category.comment || 'No category feedback yet.'}
              </p>
            </div>
          ))
        )}
      </div>
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
  const [searchParams] = useSearchParams();
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
  const mode = searchParams.get('mode') === 'grading' ? 'grading' : 'tutor';
  const isGradingMode = mode === 'grading';
  const firstTutorPreview = workbench.tutorPreviews[0] ?? null;
  const sampleParagraphs = sandboxSampleEssay
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const buildModeLink = (nextMode: 'tutor' | 'grading') => {
    const params = new URLSearchParams({
      studentFirstName: sandboxStudentFirstName,
      strictnessLevel: sandboxStrictnessLevel,
      sampleEssay: sandboxSampleEssay,
    });
    if (nextMode === 'grading') {
      params.set('mode', 'grading');
    }
    if (selectedRun?.id) {
      params.set('runId', selectedRun.id);
    }
    if (selectedVersion?.id) {
      params.set('versionId', selectedVersion.id);
    }
    return `/app/admin/assignment-types/${assignmentType.id}/ai-workbench?${params}`;
  };

  const buildRunLink = (
    run: (typeof assignmentType.aiEvaluationRuns)[number]
  ) => {
    const params = new URLSearchParams({
      runId: run.id,
      studentFirstName:
        stringValue(run.studentFirstName) || controls.studentFirstName,
      strictnessLevel:
        stringValue(run.strictnessLevel) || controls.strictnessLevel,
      sampleEssay: stringValue(run.sampleInput) || controls.sampleEssay,
    });
    if (isGradingMode) {
      params.set('mode', 'grading');
    }
    if (run.assignmentTypeAiVersion?.id) {
      params.set('versionId', run.assignmentTypeAiVersion.id);
    }
    return `/app/admin/assignment-types/${assignmentType.id}/ai-workbench?${params}`;
  };

  const buildVersionLink = (
    version: (typeof assignmentType.aiVersions)[number]
  ) => {
    const params = new URLSearchParams({
      versionId: version.id,
      studentFirstName: sandboxStudentFirstName,
      strictnessLevel: sandboxStrictnessLevel,
      sampleEssay: sandboxSampleEssay,
    });
    if (isGradingMode) {
      params.set('mode', 'grading');
    }
    return `/app/admin/assignment-types/${assignmentType.id}/ai-workbench?${params}`;
  };

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
    <main className="flex h-screen w-screen max-w-full flex-col overflow-hidden bg-white">
      <nav className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to={`/app/admin/assignment-types/${assignmentType.id}`}>
              <ArrowLeft className="mr-2 size-4 shrink-0" />
              Exit
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold md:text-base">
              {isGradingMode ? 'Grading test' : 'Tutor test'}:{' '}
              {assignmentType.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" size="sm">
                Sandbox only
              </Badge>
              <Badge variant="outline" size="sm">
                {selectedVersion
                  ? `v${selectedVersion.versionNumber}`
                  : latestVersion
                    ? `v${latestVersion.versionNumber}`
                    : 'Current version'}
              </Badge>
              {selectedRun ? (
                <span className="truncate text-xs text-muted-foreground">
                  {stringValue(selectedRun.label, 'Untitled test')}
                  {selectedRunNotes ? ` - ${selectedRunNotes}` : ''}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={!isGradingMode ? 'secondary' : 'ghost'}
            size="sm"
            asChild
          >
            <Link to={buildModeLink('tutor')}>
              <BotIcon className="mr-2 size-4" />
              Tutor test
            </Link>
          </Button>
          <Button
            type="button"
            variant={isGradingMode ? 'secondary' : 'ghost'}
            size="sm"
            asChild
          >
            <Link to={buildModeLink('grading')}>
              <ClipboardCheckIcon className="mr-2 size-4" />
              Grading test
            </Link>
          </Button>
        </div>
      </nav>

      {isGradingMode ? (
        <div className="flex min-h-0 grow flex-col overflow-y-auto bg-white lg:flex-row lg:overflow-hidden">
          <aside
            className="no-scrollbar flex shrink-0 flex-col overflow-y-auto border-r bg-white"
            style={{ width: 380, maxWidth: '100%' }}
          >
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Grade Summary</span>
              <Badge variant="outline" size="sm">
                Sandbox
              </Badge>
            </div>
            <div className="space-y-5 p-4">
              <Form method="post" className="space-y-3">
                <input type="hidden" name="mode" value="grading" />
                {selectedVersion ? (
                  <input
                    type="hidden"
                    name="versionId"
                    value={selectedVersion.id}
                  />
                ) : null}
                <input
                  type="hidden"
                  name="studentFirstName"
                  value={sandboxStudentFirstName}
                />
                <input
                  type="hidden"
                  name="sampleEssay"
                  value={sandboxSampleEssay}
                />
                <div className="space-y-2">
                  <Label htmlFor="gradingStrictnessLevel">Strictness</Label>
                  <select
                    id="gradingStrictnessLevel"
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gradingEvaluationLabel">Test name</Label>
                  <Input
                    id="gradingEvaluationLabel"
                    name="label"
                    placeholder="Advanced thesis check"
                  />
                </div>
                <Button
                  type="submit"
                  name="intent"
                  value="runEvaluation"
                  className="w-full"
                >
                  Grading Assistant Suggestions
                </Button>
              </Form>

              {selectedRunResultJson ? (
                <GradingFeedback result={selectedRunResultJson} />
              ) : (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Rubric</div>
                  {rubricCategories.length === 0 ? (
                    <p className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
                      No rubric categories have been configured yet.
                    </p>
                  ) : (
                    rubricCategories.map((category) => (
                      <div key={category.key} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">
                            {category.label}
                          </p>
                          <span className="text-xs font-medium text-muted-foreground">
                            Not scored
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {category.description}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </aside>

          <section
            className="flex min-w-0 grow flex-col overflow-y-auto bg-white"
            data-testid="ai-workbench-test-document"
          >
            <div className="border-b bg-muted/20 px-4 py-3">
              <Form
                method="get"
                preventScrollReset
                className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]"
              >
                <input type="hidden" name="mode" value="grading" />
                {selectedVersion ? (
                  <input
                    type="hidden"
                    name="versionId"
                    value={selectedVersion.id}
                  />
                ) : null}
                <input
                  type="hidden"
                  name="strictnessLevel"
                  value={sandboxStrictnessLevel}
                />
                <div className="space-y-2">
                  <Label htmlFor="gradingStudentFirstName">Student name</Label>
                  <Input
                    id="gradingStudentFirstName"
                    name="studentFirstName"
                    value={sandboxStudentFirstName}
                    onChange={(event) =>
                      setSandboxStudentFirstName(event.currentTarget.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gradingSampleEssay">Test document</Label>
                  <Textarea
                    id="gradingSampleEssay"
                    name="sampleEssay"
                    rows={2}
                    value={sandboxSampleEssay}
                    onChange={(event) =>
                      setSandboxSampleEssay(event.currentTarget.value)
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" size="sm">
                    Update document
                  </Button>
                </div>
              </Form>
            </div>
            <article className="mx-auto w-full max-w-3xl grow px-5 py-8 md:px-10">
              <div className="mb-6 rounded-md border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Assignment Prompt
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {assignmentType.title}
                </h2>
              </div>
              <div className="prose prose-slate max-w-none text-base leading-8">
                {sampleParagraphs.length > 0 ? (
                  sampleParagraphs.map((paragraph, index) => (
                    <p key={`${paragraph.slice(0, 24)}:${index}`}>
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    Enter a test document to preview grading.
                  </p>
                )}
              </div>
            </article>
          </section>

          <aside
            className="no-scrollbar shrink-0 overflow-y-auto border-l bg-white"
            style={{ width: 320, maxWidth: '100%' }}
          >
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Comments</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Sandbox grading does not create real submission comments.
              </p>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Assignment setup</p>
                <div className="mt-3 space-y-3">
                  {workbench.tutorPreviews.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tutor modules have been configured yet.
                    </p>
                  ) : (
                    workbench.tutorPreviews.map((preview) => (
                      <div
                        key={`${preview.moduleId}:${preview.instructionId ?? 'module'}`}
                        className="text-sm"
                      >
                        <p className="font-medium">{preview.moduleTitle}</p>
                        <p className="text-muted-foreground">
                          {preview.instructionTitle}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Past tests</p>
                <div className="mt-3 space-y-2">
                  {assignmentType.aiEvaluationRuns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No saved tests yet.
                    </p>
                  ) : (
                    assignmentType.aiEvaluationRuns.slice(0, 5).map((run) => (
                      <Link
                        key={run.id}
                        to={buildRunLink(run)}
                        className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/30"
                      >
                        <span className="block font-medium">
                          {run.label ?? 'Untitled test'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatWorkbenchDate(run.createdAt)} by{' '}
                          {runActorLabel(run)}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Versions</p>
                <div className="mt-3 space-y-2">
                  {assignmentType.aiVersions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No AI snapshots have been recorded yet.
                    </p>
                  ) : (
                    assignmentType.aiVersions.slice(0, 5).map((version) => (
                      <Link
                        key={version.id}
                        to={buildVersionLink(version)}
                        className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/30"
                      >
                        <span>
                          v{version.versionNumber}
                          {latestVersion?.id === version.id ? ' Current' : ''}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatWorkbenchDate(version.createdAt)}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
                {selectedVersion && versionComparison?.hasChanges ? (
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    You are replaying v{selectedVersion.versionNumber}; the
                    current version has later changes.
                  </p>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="mx-auto flex min-h-0 flex-1 w-full max-w-screen-2xl flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <section
            className="flex w-full flex-col border-r bg-muted/30 pb-2 md:w-3/5"
            data-testid="ai-workbench-tutor-panel"
          >
            <div
              className="flex items-center justify-between gap-4 border-b py-1 pl-4 pr-2"
              data-testid="tutor-module-header"
            >
              <div className="flex h-[32px] min-w-0 flex-grow items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Previous tutor step"
                  disabled
                >
                  <span aria-hidden="true">‹</span>
                </Button>
                <p className="truncate text-sm font-bold text-foreground/80">
                  {firstTutorPreview?.moduleTitle ?? 'Tutor'}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Next tutor step"
                  disabled
                >
                  <span aria-hidden="true">›</span>
                </Button>
              </div>
              <Badge variant="outline" size="sm">
                Sandbox
              </Badge>
            </div>
            <div className="no-scrollbar flex min-h-[320px] grow flex-col gap-4 overflow-y-auto p-4">
              <div className="mr-auto max-w-[92%] rounded-xl rounded-bl-none bg-ring/20 px-3 py-2 text-sm leading-6">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold">Tutor</p>
                  {firstTutorPreview ? (
                    <p className="text-xs text-muted-foreground/80">
                      {firstTutorPreview.instructionTitle}
                    </p>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap">
                  {firstTutorPreview?.instructionPrompt ??
                    'No tutor module has been configured yet.'}
                </p>
              </div>
              {selectedRunResultJson ? (
                <TutorFeedback result={selectedRunResultJson} />
              ) : null}
            </div>
            <div className="border-t bg-white p-3">
              <Form
                method="post"
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <input type="hidden" name="mode" value="tutor" />
                {selectedVersion ? (
                  <input
                    type="hidden"
                    name="versionId"
                    value={selectedVersion.id}
                  />
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
                <input
                  type="hidden"
                  name="sampleEssay"
                  value={sandboxSampleEssay}
                />
                <div className="space-y-2">
                  <Label htmlFor="tutorEvaluationLabel">Test name</Label>
                  <Input
                    id="tutorEvaluationLabel"
                    name="label"
                    placeholder="Advanced thesis check"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" name="intent" value="runEvaluation">
                    Run safe tutor test
                  </Button>
                </div>
              </Form>
            </div>
          </section>

          <section
            className="flex min-w-0 grow flex-col overflow-y-auto bg-white"
            data-testid="ai-workbench-test-document"
          >
            <div className="border-b bg-muted/20 px-4 py-3">
              <Form
                method="get"
                preventScrollReset
                className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_170px_auto]"
              >
                {selectedVersion ? (
                  <input
                    type="hidden"
                    name="versionId"
                    value={selectedVersion.id}
                  />
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
                  <Label htmlFor="sampleEssay">Test document</Label>
                  <Textarea
                    id="sampleEssay"
                    name="sampleEssay"
                    rows={3}
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
                </div>
                <div className="flex items-end">
                  <Button type="submit" size="sm">
                    Update document
                  </Button>
                </div>
              </Form>
            </div>
            <article className="mx-auto w-full max-w-3xl grow px-5 py-8 md:px-10">
              <div className="mb-6 rounded-md border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Assignment Prompt
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {assignmentType.title}
                </h2>
              </div>
              <div className="prose prose-slate max-w-none text-base leading-8">
                {sampleParagraphs.length > 0 ? (
                  sampleParagraphs.map((paragraph, index) => (
                    <p key={`${paragraph.slice(0, 24)}:${index}`}>
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    Enter a test document to preview the tutor.
                  </p>
                )}
              </div>
            </article>
          </section>
        </div>
      )}
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
