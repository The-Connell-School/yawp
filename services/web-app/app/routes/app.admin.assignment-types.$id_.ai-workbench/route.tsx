import {
  data as dataResponse,
  Form,
  Link,
  redirect,
  useLoaderData,
} from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { ArrowLeft } from 'lucide-react';
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
import { createAssignmentTypeAiSandboxLaunch } from '~/domain/assignment-types/assignment-type-ai-sandbox.server';
import { requireAdmin, requireMembership } from '~/utils/auth.server';
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
    intent !== 'runLiveEvaluation' &&
    intent !== 'launchTutorSandbox' &&
    intent !== 'launchGradingSandbox'
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
  const launchMode =
    intent === 'launchTutorSandbox'
      ? 'tutor'
      : intent === 'launchGradingSandbox'
        ? 'grading'
        : null;

  if (launchMode) {
    const membership = await requireMembership(request, admin.id);
    const launch = await createAssignmentTypeAiSandboxLaunch({
      assignmentTypeId,
      assignmentTypeAiVersionId: selectedVersion?.id ?? latestVersion?.id ?? null,
      createdByUserId: admin.id,
      membershipId: membership.id,
      mode: launchMode,
      label,
      notes,
      controls,
      promptSnapshotJson: buildPromptSnapshot({ workbench, controls }),
      assignmentTypeTitle: workbench.assignmentType.title,
    });
    const exitTo = `/app/admin/assignment-types/${assignmentTypeId}/ai-workbench`;
    const launchParams = new URLSearchParams({
      aiWorkbenchRunId: launch.runId,
      exitTo,
    });

    if (launchMode === 'grading') {
      if (!launch.submissionId) {
        throw new Response('Unable to create grading sandbox', { status: 500 });
      }

      return redirect(
        `/app/submissions/${launch.submissionId}?edit=1&${launchParams}`
      );
    }

    return redirect(`/app/documents/${launch.documentId}?${launchParams}`);
  }

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

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
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
  const latestVersion = assignmentType.aiVersions[0] ?? null;
  const rubricCategories = workbench.assignmentType.rubricCategories;
  const tutorModuleTitles = Array.from(
    new Set(
      workbench.tutorPreviews
        .map((preview) => preview.moduleTitle)
        .filter(Boolean)
    )
  );
  const activeVersionLabel = selectedVersion
    ? `v${selectedVersion.versionNumber}`
    : latestVersion
      ? `v${latestVersion.versionNumber}`
      : 'Current config';

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
      studentFirstName: controls.studentFirstName,
      strictnessLevel: controls.strictnessLevel,
      sampleEssay: controls.sampleEssay,
    });
    return `/app/admin/assignment-types/${assignmentType.id}/ai-workbench?${params}`;
  };

  return (
    <main className="min-h-screen bg-background">
      <nav className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button type="button" variant="ghost" size="sm" asChild>
              <Link to={`/app/admin/assignment-types/${assignmentType.id}`}>
                <ArrowLeft className="mr-2 size-4 shrink-0" />
                Exit
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">
                Test assignment type: {assignmentType.title}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" size="sm">
                  Sandbox only
                </Badge>
                <Badge variant="outline" size="sm">
                  {activeVersionLabel}
                </Badge>
                {selectedRun ? (
                  <Badge variant="outline" size="sm">
                    {stringValue(selectedRun.label, 'Loaded test')}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to={`/app/admin/assignment-types/${assignmentType.id}`}>
              Assignment settings
            </Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {selectedVersion && versionComparison?.hasChanges ? (
            <div className="rounded-md border bg-white px-4 py-3 text-sm text-muted-foreground">
              Testing v{selectedVersion.versionNumber}; current settings have
              later changes.
            </div>
          ) : null}

          <section className="rounded-lg border bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Sandbox launch</h2>
              <Badge variant="outline" size="sm">
                {activeVersionLabel}
              </Badge>
            </div>

            <Form method="post" className="mt-5 space-y-4">
              {selectedVersion ? (
                <input
                  type="hidden"
                  name="versionId"
                  value={selectedVersion.id}
                />
              ) : null}

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                <div className="space-y-2">
                  <Label htmlFor="studentFirstName">Student name</Label>
                  <Input
                    id="studentFirstName"
                    name="studentFirstName"
                    defaultValue={controls.studentFirstName}
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
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sampleEssay">Test document</Label>
                <Textarea
                  id="sampleEssay"
                  name="sampleEssay"
                  rows={10}
                  defaultValue={controls.sampleEssay}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="evaluationLabel">Test name</Label>
                <Input
                  id="evaluationLabel"
                  name="label"
                  defaultValue={stringValue(selectedRun?.label)}
                  placeholder="Advanced thesis check"
                />
              </div>

              <div className="flex flex-wrap gap-3 border-t pt-4">
                <Button type="submit" name="intent" value="launchTutorSandbox">
                  Open tutor test
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="launchGradingSandbox"
                  variant="secondary"
                >
                  Open grading test
                </Button>
              </div>
            </Form>
          </section>

          <section className="rounded-lg border bg-white p-5">
            <h2 className="text-base font-semibold">Assignment setup</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium">Rubric</p>
                {rubricCategories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No rubric categories configured.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {rubricCategories.map((category) => (
                      <div key={category.key} className="text-sm">
                        <p className="font-medium">{category.label}</p>
                        <p className="text-muted-foreground">
                          {category.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">Tutor modules</p>
                {tutorModuleTitles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tutor modules configured.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tutorModuleTitles.map((moduleTitle) => (
                      <p key={moduleTitle} className="text-sm">
                        {moduleTitle}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Versions</h2>
            <div className="mt-3 space-y-2">
              {assignmentType.aiVersions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No AI snapshots recorded.
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
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Recent sandbox tests</h2>
            <div className="mt-3 space-y-2">
              {assignmentType.aiEvaluationRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sandbox tests recorded.
                </p>
              ) : (
                assignmentType.aiEvaluationRuns.slice(0, 6).map((run) => (
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
          </section>
        </aside>
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
