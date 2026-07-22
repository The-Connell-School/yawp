import * as React from 'react';
import {
  type ActionFunctionArgs,
  data as dataResponse,
  Link,
  type LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
} from 'react-router';
import { AlertTriangle, ChevronLeft, ShieldCheck } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { Badge, type BadgeProps } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  createAiPromptDraft,
  isAiBehaviorEvalLabEnabled,
  promoteAiPromptVersion,
  reviewAiPromptCalibration,
  rollbackAiPromptVersion,
  updateAiPromptDraft,
} from '~/domain/ai-evaluation/prompt-version-control.server';
import { runAiBehaviorEvaluation } from '~/domain/ai-evaluation/ai-behavior-evaluation-runner.server';
import type { AiPromptSurface } from '~/domain/ai-evaluation/prompt-template.shared';

const PROMPT_SURFACES = ['tutor', 'grading'] as const;

function isPromptSurface(value: unknown): value is AiPromptSurface {
  return value === 'tutor' || value === 'grading';
}

function surfaceLabel(surface: AiPromptSurface) {
  return surface === 'tutor' ? 'Tutor' : 'Grading';
}

function shortHash(hash: string) {
  return hash.slice(0, 12);
}

function formatDateTime(value: Date | string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function versionStatusBadgeVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'production':
      return 'success';
    case 'draft':
      return 'info-soft';
    case 'retired':
      return 'outline';
    default:
      return 'secondary';
  }
}

function runStatusBadgeVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'passed':
      return 'success';
    case 'failed':
      return 'destructive';
    case 'needs_review':
      return 'warning-soft';
    default:
      return 'info-soft';
  }
}

function safeActionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const safePatterns = [
    /^(Unknown (tutor|grading) prompt variable:|tutor .* must include|grading .* must include)/,
    /^(Assignment type|Editable prompt draft|Prompt version|Passing evaluation run|Prompt or evaluation run|Production prompt version|Evaluated rollback target) not found\.$/,
    /^Only a draft prompt can start/,
    /^Only draft prompts can be promoted\.$/,
    /^Prompt surface is invalid\.$/,
    /^Prompt content hash does not match/,
    /^The evaluation run belongs to another prompt or assignment type\.$/,
    /^The evaluation run is stale for this prompt content\.$/,
    /^The evaluation run must pass every blocking case\.$/,
    /^Calibration review is required before promotion\.$/,
  ];
  return safePatterns.some((pattern) => pattern.test(message))
    ? message
    : 'The requested prompt action could not be completed.';
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  if (!isAiBehaviorEvalLabEnabled()) {
    throw new Response('Not Found', { status: 404 });
  }

  const assignmentTypeId = params.id;
  if (!assignmentTypeId) {
    throw new Response('Not Found', { status: 404 });
  }

  const assignmentType = await prisma.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    select: { id: true, title: true },
  });
  if (!assignmentType) {
    throw new Response('Not Found', { status: 404 });
  }

  const [promptVersions, evaluationRuns] = await Promise.all([
    prisma.assignmentTypePromptVersion.findMany({
      where: { assignmentTypeId },
      orderBy: [{ surface: 'asc' }, { version: 'desc' }],
      select: {
        id: true,
        surface: true,
        version: true,
        revision: true,
        status: true,
        source: true,
        contentHash: true,
        systemMessageTemplate: true,
        userMessageTemplate: true,
        createdAt: true,
        promotedAt: true,
        rollbackTargetId: true,
        author: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.assignmentTypeEvaluationRun.findMany({
      where: { assignmentTypeId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        promptVersionId: true,
        promptContentHash: true,
        status: true,
        totalCases: true,
        passedCases: true,
        failedCases: true,
        needsReviewCases: true,
        model: true,
        provider: true,
        durationMs: true,
        inputTokens: true,
        outputTokens: true,
        createdAt: true,
        completedAt: true,
        calibrationReviewedAt: true,
        runBy: { select: { id: true, name: true, email: true } },
        calibrationReviewedBy: {
          select: { id: true, name: true, email: true },
        },
        promptVersion: {
          select: {
            id: true,
            surface: true,
            version: true,
            revision: true,
            status: true,
          },
        },
      },
    }),
  ]);

  return dataResponse({ assignmentType, promptVersions, evaluationRuns });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const adminUser = await requireAdmin(request);

  if (!isAiBehaviorEvalLabEnabled()) {
    throw new Response('Not Found', { status: 404 });
  }

  const assignmentTypeId = params.id;
  if (!assignmentTypeId) {
    throw new Response('Not Found', { status: 404 });
  }

  const assignmentType = await prisma.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    select: { id: true },
  });
  if (!assignmentType) {
    throw new Response('Not Found', { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get('intent');

  try {
    if (intent === 'create-draft') {
      const surface = formData.get('surface');
      if (!isPromptSurface(surface)) {
        return dataResponse(
          { status: 'error', error: 'Select a valid prompt surface.' },
          { status: 400 }
        );
      }
      await createAiPromptDraft({
        assignmentTypeId,
        surface,
        authorUserId: adminUser.id,
      });
      return dataResponse({ status: 'success' });
    }

    if (intent === 'save-draft') {
      const surface = formData.get('surface');
      const promptVersionId = formData.get('promptVersionId')?.toString();
      const systemMessage = formData.get('systemMessage')?.toString() ?? '';
      const userMessage = formData.get('userMessage')?.toString() ?? '';

      if (!isPromptSurface(surface)) {
        return dataResponse(
          { status: 'error', error: 'Select a valid prompt surface.' },
          { status: 400 }
        );
      }
      if (!promptVersionId) {
        return dataResponse(
          { status: 'error', error: 'Prompt draft is required.' },
          { status: 400 }
        );
      }
      if (!systemMessage.trim() || !userMessage.trim()) {
        return dataResponse(
          { status: 'error', error: 'Both template fields are required.' },
          { status: 400 }
        );
      }

      await updateAiPromptDraft({
        assignmentTypeId,
        promptVersionId,
        surface,
        template: { systemMessage, userMessage },
      });
      return dataResponse({ status: 'success' });
    }

    if (intent === 'run-evaluation') {
      const promptVersionId = formData.get('promptVersionId')?.toString();
      if (!promptVersionId) {
        return dataResponse(
          { status: 'error', error: 'Prompt draft is required.' },
          { status: 400 }
        );
      }
      await runAiBehaviorEvaluation({
        assignmentTypeId,
        promptVersionId,
        runByUserId: adminUser.id,
      });
      return dataResponse({ status: 'success' });
    }

    if (intent === 'review-calibration') {
      const runId = formData.get('runId')?.toString();
      if (!runId) {
        return dataResponse(
          { status: 'error', error: 'Evaluation run is required.' },
          { status: 400 }
        );
      }
      await reviewAiPromptCalibration({
        assignmentTypeId,
        runId,
        reviewerUserId: adminUser.id,
      });
      return dataResponse({ status: 'success' });
    }

    if (intent === 'promote') {
      const promptVersionId = formData.get('promptVersionId')?.toString();
      const runId = formData.get('runId')?.toString();
      if (!promptVersionId || !runId) {
        return dataResponse(
          {
            status: 'error',
            error: 'Prompt draft and evaluation run are required.',
          },
          { status: 400 }
        );
      }
      await promoteAiPromptVersion({
        assignmentTypeId,
        promptVersionId,
        runId,
      });
      return dataResponse({ status: 'success' });
    }

    if (intent === 'rollback') {
      const surface = formData.get('surface');
      const productionVersionId = formData
        .get('productionVersionId')
        ?.toString();
      if (!isPromptSurface(surface)) {
        return dataResponse(
          { status: 'error', error: 'Select a valid prompt surface.' },
          { status: 400 }
        );
      }
      if (!productionVersionId) {
        return dataResponse(
          { status: 'error', error: 'Production prompt version is required.' },
          { status: 400 }
        );
      }
      await rollbackAiPromptVersion({
        assignmentTypeId,
        surface,
        productionVersionId,
      });
      return dataResponse({ status: 'success' });
    }
  } catch (error) {
    return dataResponse(
      { status: 'error', error: safeActionErrorMessage(error) },
      { status: 400 }
    );
  }

  return dataResponse(
    { status: 'error', error: 'Unrecognized action.' },
    { status: 400 }
  );
}

type LoaderPayload = ReturnType<typeof useLoaderData<typeof loader>>;
type PromptVersion = LoaderPayload['promptVersions'][number];
type EvaluationRun = LoaderPayload['evaluationRuns'][number];

function InlineFeedback({
  fetcher,
}: {
  fetcher: ReturnType<typeof useFetcher<{ status: string; error?: string }>>;
}) {
  if (fetcher.state !== 'idle' || !fetcher.data) return null;
  if (fetcher.data.status === 'success') {
    return (
      <p role="status" className="text-sm text-green-700">
        Action completed.
      </p>
    );
  }
  if (fetcher.data.status === 'error') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {fetcher.data.error ?? 'Something went wrong.'}
      </p>
    );
  }
  return null;
}

function PromptSurfaceCard({
  surface,
  versions,
}: {
  surface: AiPromptSurface;
  versions: PromptVersion[];
}) {
  const production = versions.find(
    (version) => version.status === 'production'
  );
  const draft = versions.find((version) => version.status === 'draft');

  const createFetcher = useFetcher<{ status: string; error?: string }>();
  const saveFetcher = useFetcher<{ status: string; error?: string }>();
  const runFetcher = useFetcher<{ status: string; error?: string }>();
  const rollbackFetcher = useFetcher<{ status: string; error?: string }>();

  const [systemMessage, setSystemMessage] = React.useState(
    draft?.systemMessageTemplate ?? ''
  );
  const [userMessage, setUserMessage] = React.useState(
    draft?.userMessageTemplate ?? ''
  );

  React.useEffect(() => {
    setSystemMessage(draft?.systemMessageTemplate ?? '');
    setUserMessage(draft?.userMessageTemplate ?? '');
  }, [draft?.id, draft?.systemMessageTemplate, draft?.userMessageTemplate]);

  const isBusy =
    createFetcher.state !== 'idle' ||
    saveFetcher.state !== 'idle' ||
    runFetcher.state !== 'idle';

  return (
    <Card className="min-w-0" data-testid={`${surface}-prompt-card`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="truncate">
            {surfaceLabel(surface)} prompt
          </CardTitle>
          <CardDescription>
            {surface === 'tutor'
              ? 'Guides the student-facing writing tutor.'
              : 'Guides automated grading feedback.'}
          </CardDescription>
        </div>
        {production ? (
          <Badge variant={versionStatusBadgeVariant('production')}>
            Production v{production.version}.{production.revision}
          </Badge>
        ) : (
          <Badge variant="outline">Using built-in default</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-sm font-medium text-muted-foreground">
              Status
            </dt>
            <dd className="truncate text-base">
              {production ? 'Production' : 'None'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm font-medium text-muted-foreground">
              Version
            </dt>
            <dd className="truncate text-base tabular-nums">
              {production
                ? `v${production.version}.${production.revision}`
                : '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm font-medium text-muted-foreground">Hash</dt>
            <dd className="truncate text-base font-mono">
              {production ? shortHash(production.contentHash) : '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm font-medium text-muted-foreground">
              Source
            </dt>
            <dd className="truncate text-base">
              {production ? production.source : 'canonical-runtime-v1'}
            </dd>
          </div>
        </dl>

        {draft ? (
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={versionStatusBadgeVariant('draft')}>
                Draft v{draft.version}.{draft.revision}
              </Badge>
              <span className="text-sm text-muted-foreground font-mono truncate">
                {shortHash(draft.contentHash)}
              </span>
            </div>
            <saveFetcher.Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="save-draft" />
              <input type="hidden" name="surface" value={surface} />
              <input type="hidden" name="promptVersionId" value={draft.id} />
              <div className="space-y-1.5">
                <Label htmlFor={`${surface}-system-message`}>
                  System template
                </Label>
                <Textarea
                  id={`${surface}-system-message`}
                  name="systemMessage"
                  rows={6}
                  required
                  value={systemMessage}
                  onChange={(event) => setSystemMessage(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${surface}-user-message`}>User template</Label>
                <Textarea
                  id={`${surface}-user-message`}
                  name="userMessage"
                  rows={6}
                  required
                  value={userMessage}
                  onChange={(event) => setUserMessage(event.target.value)}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {surface === 'tutor'
                  ? 'Required variables: {{base_system}}, {{assignment_prompt}}, {{rubric_version}}, {{rubric}}, {{document_context}}, {{student_message}}.'
                  : 'Required variables: {{base_system}}, {{base_user_message}}, {{assignment_prompt}}, {{rubric_version}}.'}
              </p>
              <Button type="submit" size="sm" disabled={isBusy}>
                {saveFetcher.state !== 'idle' ? 'Saving…' : 'Save draft'}
              </Button>
              <InlineFeedback fetcher={saveFetcher} />
            </saveFetcher.Form>
            <runFetcher.Form method="post" className="flex flex-wrap gap-2">
              <input type="hidden" name="intent" value="run-evaluation" />
              <input type="hidden" name="promptVersionId" value={draft.id} />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={isBusy}
              >
                {runFetcher.state !== 'idle' ? 'Running…' : 'Run evaluation'}
              </Button>
              <InlineFeedback fetcher={runFetcher} />
            </runFetcher.Form>
          </div>
        ) : (
          <createFetcher.Form method="post" className="border-t pt-4">
            <input type="hidden" name="intent" value="create-draft" />
            <input type="hidden" name="surface" value={surface} />
            <p className="mb-2 text-sm text-muted-foreground">
              No draft yet. Create one from the current production (or built-in)
              template to start editing.
            </p>
            <Button type="submit" size="sm" variant="outline" disabled={isBusy}>
              {createFetcher.state !== 'idle' ? 'Creating…' : 'Create draft'}
            </Button>
            <InlineFeedback fetcher={createFetcher} />
          </createFetcher.Form>
        )}

        {production ? (
          <div className="border-t pt-4">
            <ConfirmationDialog
              variant="destructive"
              title={`Roll back ${surfaceLabel(surface)} prompt`}
              description="This retires the current production prompt and restores the last evaluated version, or the built-in default if no earlier production version exists."
              confirmText="Roll back"
              onConfirm={() => {
                rollbackFetcher.submit(
                  {
                    intent: 'rollback',
                    surface,
                    productionVersionId: production.id,
                  },
                  { method: 'post' }
                );
              }}
            >
              <Button
                type="button"
                size="sm"
                variant="destructive-outline"
                disabled={rollbackFetcher.state !== 'idle'}
              >
                {rollbackFetcher.state !== 'idle'
                  ? 'Rolling back…'
                  : 'Roll back production'}
              </Button>
            </ConfirmationDialog>
            <InlineFeedback fetcher={rollbackFetcher} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EvaluationRunCard({ run }: { run: EvaluationRun }) {
  const reviewFetcher = useFetcher<{ status: string; error?: string }>();
  const promoteFetcher = useFetcher<{ status: string; error?: string }>();

  const isCalibrated = Boolean(run.calibrationReviewedAt);
  const canReview = run.status === 'passed' && !isCalibrated;
  const canPromote =
    run.status === 'passed' &&
    isCalibrated &&
    run.promptVersion.status === 'draft';

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="truncate text-base">
          {surfaceLabel(run.promptVersion.surface as AiPromptSurface)} v
          {run.promptVersion.version}.{run.promptVersion.revision}
        </CardTitle>
        <Badge variant={runStatusBadgeVariant(run.status)}>
          {run.status.replace('_', ' ')}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Cases</dt>
            <dd className="truncate tabular-nums">
              {run.passedCases}/{run.totalCases} passed
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Failed</dt>
            <dd className="truncate tabular-nums">{run.failedCases}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Needs review</dt>
            <dd className="truncate tabular-nums">{run.needsReviewCases}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Duration</dt>
            <dd className="truncate tabular-nums">
              {run.durationMs != null
                ? `${Math.round(run.durationMs / 1000)}s`
                : '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Tokens</dt>
            <dd className="truncate tabular-nums">
              {run.inputTokens ?? 0} in / {run.outputTokens ?? 0} out
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Hash</dt>
            <dd className="truncate font-mono">
              {shortHash(run.promptContentHash)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Run by</dt>
            <dd className="truncate">{run.runBy.name ?? run.runBy.email}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Started</dt>
            <dd className="truncate">{formatDateTime(run.createdAt) ?? '—'}</dd>
          </div>
        </dl>

        <p className="text-muted-foreground">
          {isCalibrated ? (
            <>
              Calibrated by{' '}
              {run.calibrationReviewedBy?.name ??
                run.calibrationReviewedBy?.email}{' '}
              on {formatDateTime(run.calibrationReviewedAt)}.
            </>
          ) : (
            'Teacher calibration required before this run can be promoted.'
          )}
        </p>

        {canReview ? (
          <reviewFetcher.Form method="post">
            <input type="hidden" name="intent" value="review-calibration" />
            <input type="hidden" name="runId" value={run.id} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={reviewFetcher.state !== 'idle'}
            >
              {reviewFetcher.state !== 'idle'
                ? 'Recording…'
                : 'Mark teacher-calibrated'}
            </Button>
            <InlineFeedback fetcher={reviewFetcher} />
          </reviewFetcher.Form>
        ) : null}

        {canPromote ? (
          <ConfirmationDialog
            title="Promote to production"
            description="This retires the current production prompt for this surface and makes this evaluated, calibrated draft the new production prompt."
            confirmText="Promote"
            onConfirm={() => {
              promoteFetcher.submit(
                {
                  intent: 'promote',
                  promptVersionId: run.promptVersionId,
                  runId: run.id,
                },
                { method: 'post' }
              );
            }}
          >
            <Button
              type="button"
              size="sm"
              disabled={promoteFetcher.state !== 'idle'}
            >
              {promoteFetcher.state !== 'idle'
                ? 'Promoting…'
                : 'Promote to production'}
            </Button>
          </ConfirmationDialog>
        ) : null}
        <InlineFeedback fetcher={promoteFetcher} />
      </CardContent>
    </Card>
  );
}

export default function AiBehaviorLabRoute() {
  const { assignmentType, promptVersions, evaluationRuns } =
    useLoaderData<typeof loader>();

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/app/admin/assignment-types/${assignmentType.id}`}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to {assignmentType.title}
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
          AI behavior evaluation lab
        </h1>
        <p className="text-base text-muted-foreground text-pretty">
          Draft, evaluate, and promote tutor and grading prompts for{' '}
          {assignmentType.title}.
        </p>
      </div>

      <div
        role="alert"
        className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4"
      >
        <AlertTriangle
          className="h-5 w-5 shrink-0 text-amber-700"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <h2 className="font-semibold text-amber-900">
            Human review required
          </h2>
          <p className="text-sm text-pretty text-amber-800">
            Promotion to production stays blocked until a teacher marks a
            passing evaluation run as calibrated below. Access to this lab is
            gated by the{' '}
            <code className="font-mono">AI_BEHAVIOR_EVAL_LAB_ENABLED</code>{' '}
            environment flag, and production rollout remains a separate operator
            decision.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {PROMPT_SURFACES.map((surface) => (
          <PromptSurfaceCard
            key={surface}
            surface={surface}
            versions={promptVersions.filter(
              (version) => version.surface === surface
            )}
          />
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className="h-5 w-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="text-lg font-semibold tracking-tight">
            Evaluation runs
          </h2>
        </div>
        {evaluationRuns.length === 0 ? (
          <p className="text-base text-muted-foreground">
            No evaluation runs yet. Run an evaluation from a prompt draft above.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {evaluationRuns.map((run) => (
              <EvaluationRunCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
