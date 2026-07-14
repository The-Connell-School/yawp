import { data as dataResponse, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { EvaluationHistorySection } from '~/components/admin/rubric-config-editors';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { buildResolvedAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import type { AssignmentTypeEvaluationStatus } from '~/domain/ai-evaluation/assignment-type-evaluation.shared';
import {
  ensureEvaluationSuiteVersion,
  ensureProductionPromptVersion,
  isPromptVersionControlEnabled,
  parseEvaluationSuiteSnapshot,
} from '~/domain/ai-evaluation/prompt-version-control.server';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const EVALUATION_RUN_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function normalizeEvaluationStatus(
  status: string
): AssignmentTypeEvaluationStatus {
  if (status === 'pass' || status === 'fail' || status === 'blocked') {
    return status;
  }
  return 'needs_review';
}

function normalizePromptStatus(
  status: string
): 'draft' | 'production' | 'previous' {
  if (status === 'draft' || status === 'previous') return status;
  return 'production';
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const assignmentType = await prisma.assignmentType.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      kind: true,
      scoringScaleJson: true,
      rubricJson: true,
      gradingPromptConfigJson: true,
      gradingOutputSchemaJson: true,
      gradingCalibrationNotes: true,
      gradingAssistantVersion: true,
      gradingAssistantSourceTemplateId: true,
      gradingAssistantSourceTemplateSlug: true,
      evaluations: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      },
      evaluationCases: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!assignmentType) {
    throw new Response('Not Found', { status: 404 });
  }

  const promptVersionControlEnabled = isPromptVersionControlEnabled();
  if (promptVersionControlEnabled) {
    const gradingConfig = buildResolvedAssignmentTypeGradingConfig({
      assignmentTypeId: assignmentType.id,
      assignmentTypeKind: assignmentType.kind,
      assignmentTypeTitle: assignmentType.title,
      row: assignmentType,
    });
    await Promise.all([
      ensureProductionPromptVersion({
        db: prisma,
        assignmentTypeId: assignmentType.id,
        gradingConfig,
      }),
      ensureEvaluationSuiteVersion(prisma, assignmentType.id),
    ]);
  }

  const [promptVersions, suiteVersions, evaluationRuns] = await Promise.all([
    promptVersionControlEnabled
      ? prisma.assignmentTypePromptVersion.findMany({
          where: { assignmentTypeId: assignmentType.id },
          orderBy: { version: 'desc' },
        })
      : Promise.resolve([]),
    promptVersionControlEnabled
      ? prisma.assignmentTypeEvaluationSuiteVersion.findMany({
          where: { assignmentTypeId: assignmentType.id },
          orderBy: { version: 'desc' },
        })
      : Promise.resolve([]),
    prisma.assignmentTypeEvaluationRun.findMany({
      where: { assignmentTypeId: assignmentType.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { results: { orderBy: { createdAt: 'asc' } } },
    }),
  ]);

  const currentEvaluations = assignmentType.evaluations.map((evaluation) => ({
    id: evaluation.id,
    title: evaluation.title,
    description: evaluation.description,
    position: evaluation.position,
    archived: Boolean(evaluation.archivedAt),
    createdAt: evaluation.createdAt.toISOString(),
  }));
  const currentCases = assignmentType.evaluationCases.map((evaluationCase) => ({
    id: evaluationCase.id,
    evaluationId: evaluationCase.evaluationId,
    title: evaluationCase.title,
    rubricCategoryKey: evaluationCase.rubricCategoryKey,
    documentText: evaluationCase.documentText,
    criterion: evaluationCase.criterion,
    expectedOutput: evaluationCase.expectedOutputJson,
    position: evaluationCase.position,
    archived: Boolean(evaluationCase.archivedAt),
    createdAt: evaluationCase.createdAt.toISOString(),
  }));

  const evaluationHistory = {
    promptVersions: promptVersions.map((promptVersion) => ({
      id: promptVersion.id,
      version: promptVersion.version,
      revision: promptVersion.revision,
      status: normalizePromptStatus(promptVersion.status),
      systemMessageTemplate: promptVersion.systemMessageTemplate,
      userMessageTemplate: promptVersion.userMessageTemplate,
      variableSchema: promptVersion.variableSchemaJson,
      contentHash: promptVersion.contentHash,
      createdAt: promptVersion.createdAt.toISOString(),
      updatedAt: promptVersion.updatedAt.toISOString(),
      promotedAt: promptVersion.promotedAt?.toISOString() ?? null,
    })),
    suiteVersions: suiteVersions.map((suiteVersion) => {
      const snapshot = parseEvaluationSuiteSnapshot(suiteVersion.snapshotJson);
      const evaluations =
        snapshot?.evaluations.map((evaluation) => ({
          id: evaluation.id,
          title: evaluation.title,
          description: evaluation.description,
          position: evaluation.position,
          archived: false,
          createdAt: suiteVersion.createdAt.toISOString(),
        })) ?? [];
      const cases = snapshot
        ? [
            ...snapshot.evaluations.flatMap((evaluation) => evaluation.cases),
            ...snapshot.legacyCases,
          ].map((evaluationCase) => ({
            id: evaluationCase.id,
            evaluationId: evaluationCase.evaluationId,
            title: evaluationCase.title,
            rubricCategoryKey: evaluationCase.rubricCategoryKey,
            documentText: evaluationCase.documentText,
            criterion: evaluationCase.criterion,
            expectedOutput: evaluationCase.expectedOutputJson,
            position: evaluationCase.position,
            archived: false,
            createdAt: suiteVersion.createdAt.toISOString(),
          }))
        : [];
      return {
        id: suiteVersion.id,
        version: suiteVersion.version,
        contentHash: suiteVersion.contentHash,
        createdAt: suiteVersion.createdAt.toISOString(),
        evaluations,
        cases,
      };
    }),
    evaluations: currentEvaluations,
    cases: currentCases,
    runs: evaluationRuns.map((run) => ({
      id: run.id,
      promptVersion: run.promptVersion,
      promptVersionId: run.promptVersionId,
      promptRevision: run.promptRevision,
      evaluationSuiteVersionId: run.evaluationSuiteVersionId,
      evaluationSuiteContentHash: run.evaluationSuiteContentHash,
      status: run.status,
      totalCases: run.totalCases,
      passedCases: run.passedCases,
      failedCases: run.failedCases,
      needsReviewCases: run.needsReviewCases,
      createdAt: run.createdAt.toISOString(),
      createdAtLabel: EVALUATION_RUN_DATE_FORMATTER.format(run.createdAt),
      completedAt: run.completedAt?.toISOString() ?? null,
      promptSnapshot: run.promptSnapshotJson,
      results: run.results.map((result) => ({
        id: result.id,
        caseId: result.caseId,
        caseTitle: result.caseTitle,
        rubricCategoryKey: result.rubricCategoryKey,
        criterion: result.criterion,
        status: normalizeEvaluationStatus(result.status),
        evidence: result.evidence,
        gradingOutput: result.gradingOutputJson,
        expectedOutput: result.expectedOutputJson,
        requestSnapshot: result.requestSnapshotJson,
      })),
    })),
  };

  return dataResponse({
    assignmentType: {
      id: assignmentType.id,
      title: assignmentType.title,
    },
    evaluationHistory,
    promptVersionControlEnabled,
  });
}

export default function AssignmentTypeEvaluationsRoute() {
  const { assignmentType, evaluationHistory, promptVersionControlEnabled } =
    useLoaderData<typeof loader>();

  return (
    // The admin layout wraps routes in a scroll container with pb-24 to leave
    // breathing room for normal scrolling pages. This route fills the full
    // remaining height instead, so we compensate for that bottom padding to
    // let the panel border reach the true bottom edge of the page.
    <div className="flex h-[calc(100%+6rem)] min-h-0 w-full flex-col">
      <EvaluationHistorySection
        assignmentTypeId={assignmentType.id}
        assignmentTypeTitle={assignmentType.title}
        evaluationHistory={evaluationHistory}
        isPromptPreviewStale={false}
        promptVersionControlEnabled={promptVersionControlEnabled}
        layout="page"
      />
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
