import { data as dataResponse, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { EvaluationHistorySection } from '~/components/admin/rubric-config-editors';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import type { AssignmentTypeEvaluationStatus } from '~/domain/ai-evaluation/assignment-type-evaluation.shared';
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

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const assignmentType = await prisma.assignmentType.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      evaluations: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      },
      evaluationCases: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      },
      evaluationRuns: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          results: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });

  if (!assignmentType) {
    throw new Response('Not Found', { status: 404 });
  }

  const evaluationHistory = {
    evaluations: assignmentType.evaluations.map((evaluation) => ({
      id: evaluation.id,
      title: evaluation.title,
      description: evaluation.description,
      position: evaluation.position,
      archived: Boolean(evaluation.archivedAt),
      createdAt: evaluation.createdAt.toISOString(),
    })),
    cases: assignmentType.evaluationCases.map((evaluationCase) => ({
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
    })),
    runs: assignmentType.evaluationRuns.map((run) => ({
      id: run.id,
      promptVersion: run.promptVersion,
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
      })),
    })),
  };

  return dataResponse({
    assignmentType: {
      id: assignmentType.id,
      title: assignmentType.title,
    },
    evaluationHistory,
  });
}

export default function AssignmentTypeEvaluationsRoute() {
  const { assignmentType, evaluationHistory } = useLoaderData<typeof loader>();

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
        layout="page"
      />
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
