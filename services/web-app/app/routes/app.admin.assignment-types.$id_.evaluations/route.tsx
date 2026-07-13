import { ArrowLeft, FlaskConical } from 'lucide-react';
import { data as dataResponse, Link, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { EvaluationHistorySection } from '~/components/admin/rubric-config-editors';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
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
    <main className="mx-auto w-full max-w-6xl px-3 py-5 md:px-6 md:py-8">
      <header className="mb-8 space-y-5">
        <Button variant="outline" size="sm" asChild>
          <Link
            to={`/app/admin/assignment-types/${assignmentType.id}`}
            className="w-fit"
          >
            <ArrowLeft className="mr-1.5 size-4 shrink-0" />
            Back to assignment type
          </Link>
        </Button>

        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <FlaskConical className="size-4" aria-hidden="true" />
            AI evaluations
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Evaluations</h1>
          <p className="text-sm text-muted-foreground">
            {assignmentType.title}
          </p>
        </div>
      </header>

      <EvaluationHistorySection
        assignmentTypeId={assignmentType.id}
        evaluationHistory={evaluationHistory}
        isPromptPreviewStale={false}
      />
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
