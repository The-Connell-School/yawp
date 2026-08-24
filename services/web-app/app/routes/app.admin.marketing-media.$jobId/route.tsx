import {
  Form,
  Link,
  data as dataResponse,
  redirect,
  useLoaderData,
  useNavigation,
  useRevalidator,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { useEffect, type ReactNode } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Clapperboard,
  Download,
  Film,
  Images,
  Monitor,
  PenLine,
  Smartphone,
  Timer,
  UserRound,
  X,
  ZoomIn,
} from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { JobStatusBadge } from '~/components/marketing/job-status-badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { requireAdmin, requireMutableRequest } from '~/utils/auth.server';
import {
  StoryboardGenerationError,
  reviseStoryboard,
} from '~/services/marketing-storyboard.server';
import { prisma } from '~/utils/db.server';
import { getSignedGetUrl } from '~/services/s3.server';
import {
  getMarketingMediaDir,
  requireMarketingStudioEnabled,
} from '~/utils/marketing-studio.server';
import {
  MAX_RENDER_ATTEMPTS,
  RENDER_LOCK_TIMEOUT_MS,
  TERMINAL_JOB_STATUSES,
  diffStoryboards,
  estimateRenderSeconds,
  safeParseStoryboard,
  type MarketingJobStatus,
  type MarketingOutput,
  type StoryboardScene,
} from '../../../../../packages/marketing-media';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';

export const handle: BreadcrumbHandle = { breadcrumb: 'Render' };

const ACTIVE_STATUSES = ['GENERATING', 'QUEUED', 'RENDERING'];

/** A connected renderer polls every few seconds; two minutes queued means nobody is coming. */
const STALLED_QUEUE_MS = 2 * 60 * 1000;

export async function loader({ request, params }: LoaderFunctionArgs) {
  requireMarketingStudioEnabled();
  await requireAdmin(request);

  const job = await prisma.marketingMediaJob.findUnique({
    where: { id: params.jobId },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      kind: true,
      status: true,
      brief: true,
      audience: true,
      subjectLabel: true,
      storyboard: true,
      model: true,
      targetUrl: true,
      outputs: true,
      error: true,
      attempts: true,
      startedAt: true,
      finishedAt: true,
      parentJobId: true,
      revisionFeedback: true,
      // The take this one was revised from, so the page can show what moved.
      parent: { select: { id: true, storyboard: true } },
      revisions: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          revisionFeedback: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      createdBy: { select: { email: true, name: true } },
    },
  });

  if (!job) {
    throw new Response('Not Found', { status: 404 });
  }

  const outputs = (
    Array.isArray(job.outputs) ? job.outputs : []
  ) as MarketingOutput[];
  // Never public either way: disk-stored media is served by the admin-gated
  // file route below; S3 media gets a short-lived signed URL.
  const mediaDir = getMarketingMediaDir();
  const signedOutputs = await Promise.all(
    outputs.map(async (output) => ({
      ...output,
      url: mediaDir
        ? `/app/admin/marketing-media/${job.id}/file/${encodeURIComponent(
            output.key.split('/').at(-1) ?? ''
          )}`
        : await getSignedGetUrl(output.key, 60 * 60),
    }))
  );

  const parsedStoryboard = job.storyboard
    ? safeParseStoryboard(job.storyboard)
    : null;

  // A healthy renderer claims a queued job within seconds — but the worker is
  // single-threaded and takes jobs oldest-first, so a long wait usually means
  // it is busy, not absent. Waiting alone is not evidence that nobody is
  // home: ask whether a worker holds a live claim before telling an admin to
  // go start a renderer that is already running.
  const queuedMs =
    job.status === 'QUEUED' ? Date.now() - job.updatedAt.getTime() : 0;

  const [activeRender, queueAhead] =
    job.status === 'QUEUED'
      ? await Promise.all([
          prisma.marketingMediaJob.findFirst({
            where: {
              status: 'RENDERING',
              // A dead worker's abandoned lock is not a live renderer.
              lockedAt: {
                gte: new Date(Date.now() - RENDER_LOCK_TIMEOUT_MS),
              },
            },
            select: { id: true },
          }),
          // Same eligibility and ordering the worker claims by, so the count
          // is really "ahead of this one", not just "also waiting".
          prisma.marketingMediaJob.count({
            where: {
              status: 'QUEUED',
              createdAt: { lt: job.createdAt },
              attempts: { lt: MAX_RENDER_ATTEMPTS },
            },
          }),
        ])
      : [null, 0];

  const rendererBusy = Boolean(activeRender);

  return dataResponse({
    job: {
      ...job,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      revisions: job.revisions.map((revision) => ({
        ...revision,
        createdAt: revision.createdAt.toISOString(),
      })),
    },
    outputs: signedOutputs,
    // Null on a first take — there is nothing to have changed from. An empty
    // array is a different statement: this revision moved nothing at all.
    changes: job.parent
      ? diffStoryboards(job.parent.storyboard, job.storyboard)
      : null,
    storyboard: parsedStoryboard?.success ? parsedStoryboard.data : null,
    estimatedSeconds: parsedStoryboard?.success
      ? estimateRenderSeconds(parsedStoryboard.data)
      : null,
    queueStalled: queuedMs > STALLED_QUEUE_MS && !rendererBusy,
    waitingForTurn: job.status === 'QUEUED' && rendererBusy,
    queueAhead,
    queuedMinutes: Math.floor(queuedMs / 60_000),
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  requireMarketingStudioEnabled();
  const admin = await requireAdmin(request);
  await requireMutableRequest(request);

  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');

  const job = await prisma.marketingMediaJob.findUnique({
    where: { id: params.jobId },
    select: {
      id: true,
      status: true,
      storyboard: true,
      kind: true,
      brief: true,
      audience: true,
      subjectType: true,
      subjectId: true,
      subjectLabel: true,
      targetUrl: true,
    },
  });
  if (!job) throw new Response('Not Found', { status: 404 });

  if (intent === 'cancel') {
    if (TERMINAL_JOB_STATUSES.includes(job.status as MarketingJobStatus)) {
      return dataResponse(
        { error: 'That job already finished.' },
        { status: 400 }
      );
    }
    await prisma.marketingMediaJob.update({
      where: { id: job.id },
      data: {
        status: 'CANCELLED',
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
    return dataResponse({ ok: true });
  }

  // Watch the take, say what to change. The revision is a new job written by
  // the model from this job's storyboard plus the feedback, so a good take
  // survives its own critique — only what the feedback questions moves.
  if (intent === 'refine') {
    const feedback = String(formData.get('feedback') ?? '').trim();
    if (!feedback) {
      return dataResponse(
        { error: 'Say what should change about this render.' },
        { status: 400 }
      );
    }
    if (!job.storyboard) {
      return dataResponse(
        { error: 'This job has no storyboard to revise.' },
        { status: 400 }
      );
    }

    const revisionJob = await prisma.marketingMediaJob.create({
      data: {
        createdById: admin.id,
        kind: job.kind,
        status: 'GENERATING',
        brief: job.brief,
        audience: job.audience,
        subjectType: job.subjectType,
        subjectId: job.subjectId,
        subjectLabel: job.subjectLabel,
        targetUrl: job.targetUrl,
        parentJobId: job.id,
        revisionFeedback: feedback,
      },
      select: { id: true },
    });

    try {
      const revised = await reviseStoryboard({
        brief: job.brief,
        kind: job.kind as 'STILLS' | 'CLIP',
        previousStoryboard: job.storyboard,
        feedback,
        audience: job.audience,
      });
      await prisma.marketingMediaJob.update({
        where: { id: revisionJob.id },
        data: {
          status: 'QUEUED',
          storyboard: revised.storyboard,
          model: revised.model,
        },
      });
    } catch (err) {
      // The revision job survives a generation failure on purpose, same as
      // first-run generation: the admin needs to see why.
      await prisma.marketingMediaJob.update({
        where: { id: revisionJob.id },
        data: {
          status: 'FAILED',
          error:
            err instanceof StoryboardGenerationError
              ? err.message
              : `Storyboard revision failed: ${err instanceof Error ? err.message : String(err)}`,
          finishedAt: new Date(),
        },
      });
    }

    return redirect(`/app/admin/marketing-media/${revisionJob.id}`);
  }

  if (intent === 'retry') {
    if (!job.storyboard) {
      return dataResponse(
        { error: 'This job has no storyboard to re-render.' },
        { status: 400 }
      );
    }
    // A render already in progress owns this row: the worker claimed it,
    // holds a browser open, and will call markSucceeded/markFailed on it
    // when done. Resetting the row here doesn't stop that browser — it just
    // makes an actively-filming job look freshly QUEUED with attempts wiped,
    // which is what "stuck in the queue" turned out to mean in practice.
    if (ACTIVE_STATUSES.includes(job.status as MarketingJobStatus)) {
      return dataResponse(
        {
          error: `This job is still ${job.status.toLowerCase()}. Wait for it to finish before re-rendering.`,
        },
        { status: 400 }
      );
    }
    await prisma.marketingMediaJob.update({
      where: { id: job.id },
      data: {
        status: 'QUEUED',
        error: null,
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        finishedAt: null,
      },
    });
    return dataResponse({ ok: true });
  }

  return dataResponse({ error: 'Unknown action.' }, { status: 400 });
}

type StageState = 'done' | 'active' | 'failed' | 'stopped' | 'pending';

/**
 * Where a job stands, drawn as the pipeline it travels: storyboard →
 * queue → filming → media. Which stage a failure or cancellation landed in
 * is read off the row — a job with no storyboard died writing one, a job
 * with one died (or was stopped) later.
 */
function pipelineStages(job: {
  status: string;
  storyboard: unknown;
}): { key: string; label: string; icon: ReactNode; state: StageState }[] {
  const hasStoryboard = Boolean(job.storyboard);
  const states: Record<string, StageState[]> = {
    GENERATING: ['active', 'pending', 'pending'],
    QUEUED: ['done', 'active', 'pending'],
    RENDERING: ['done', 'done', 'active'],
    SUCCEEDED: ['done', 'done', 'done'],
    FAILED: hasStoryboard
      ? ['done', 'done', 'failed']
      : ['failed', 'pending', 'pending'],
    CANCELLED: hasStoryboard
      ? ['done', 'stopped', 'stopped']
      : ['stopped', 'stopped', 'stopped'],
  };
  const [storyboardState, queueState, filmingState] = states[job.status] ?? [
    'pending',
    'pending',
    'pending',
  ];

  return [
    {
      key: 'storyboard',
      label: 'Storyboard',
      icon: <PenLine className="h-3.5 w-3.5" aria-hidden />,
      state: storyboardState,
    },
    {
      key: 'queue',
      label: 'Queue',
      icon: <Timer className="h-3.5 w-3.5" aria-hidden />,
      state: queueState,
    },
    {
      key: 'filming',
      label: 'Filming',
      icon: <Clapperboard className="h-3.5 w-3.5" aria-hidden />,
      state: filmingState,
    },
    {
      key: 'media',
      label: 'Media',
      icon: <Images className="h-3.5 w-3.5" aria-hidden />,
      state:
        job.status === 'SUCCEEDED'
          ? 'done'
          : filmingState === 'active'
            ? 'pending'
            : filmingState === 'done'
              ? 'done'
              : filmingState,
    },
  ];
}

const STAGE_CIRCLE: Record<StageState, string> = {
  done: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  active:
    'border-indigo-400 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200 animate-pulse',
  failed: 'border-red-300 bg-red-50 text-red-700',
  stopped: 'border-gray-300 bg-gray-100 text-gray-500',
  pending: 'border-border bg-muted/40 text-muted-foreground/60',
};

function PipelineRail({ stages }: { stages: ReturnType<typeof pipelineStages> }) {
  return (
    <ol className="flex items-center gap-0" aria-label="Render pipeline">
      {stages.map((stage, index) => (
        <li key={stage.key} className="flex items-center">
          {index > 0 ? (
            <span
              aria-hidden
              className={`mx-1 h-px w-6 md:w-10 ${
                stage.state === 'pending' ? 'bg-border' : 'bg-emerald-300'
              }`}
            />
          ) : null}
          <span className="flex items-center gap-1.5">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border ${STAGE_CIRCLE[stage.state]}`}
            >
              {stage.state === 'done' ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : stage.state === 'failed' || stage.state === 'stopped' ? (
                <X className="h-3.5 w-3.5" aria-hidden />
              ) : (
                stage.icon
              )}
            </span>
            <span
              className={`hidden text-xs sm:block ${
                stage.state === 'pending'
                  ? 'text-muted-foreground/60'
                  : 'text-foreground'
              }`}
            >
              {stage.label}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One human line for what a scene's steps do, without dumping JSON on the page. */
function summarizeSteps(scene: StoryboardScene): string | null {
  if (!scene.steps || scene.steps.length === 0) return null;
  const counts = new Map<string, number>();
  for (const step of scene.steps) {
    counts.set(step.action, (counts.get(step.action) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([action, count]) => (count > 1 ? `${action} ×${count}` : action))
    .join(' · ');
}

export default function Route() {
  const {
    job,
    outputs,
    changes,
    storyboard,
    estimatedSeconds,
    queueStalled,
    waitingForTurn,
    queueAhead,
    queuedMinutes,
  } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const active = ACTIVE_STATUSES.includes(job.status);
  const refining =
    navigation.state === 'submitting' &&
    navigation.formData?.get('intent') === 'refine';

  // A render takes minutes and finishes in a worker, so the page checks back
  // rather than making the admin reload to find out.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => revalidator.revalidate(), 10_000);
    return () => clearInterval(timer);
  }, [active, revalidator]);

  const sceneSeconds =
    storyboard?.scenes.map((scene) =>
      estimateRenderSeconds({ scenes: [scene] })
    ) ?? [];
  const totalSceneSeconds = sceneSeconds.reduce(
    (total, seconds) => total + seconds,
    0
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            to="/app/admin/marketing-media"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            All renders
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">
            {storyboard?.title ?? 'Untitled render'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <JobStatusBadge status={job.status} />
            {job.parentJobId ? (
              <Link
                className="underline"
                to={`/app/admin/marketing-media/${job.parentJobId}`}
              >
                Revision of an earlier take
              </Link>
            ) : null}
            <span className="inline-flex items-center gap-1">
              {job.kind === 'CLIP' ? (
                <Film className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Camera className="h-3.5 w-3.5" aria-hidden />
              )}
              {job.kind === 'CLIP' ? 'Silent clip' : 'Screenshots'}
            </span>
            {estimatedSeconds ? (
              <span className="inline-flex items-center gap-1">
                <Timer className="h-3.5 w-3.5" aria-hidden />~{estimatedSeconds}
                s of screen time
              </span>
            ) : null}
            {storyboard ? (
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3.5 w-3.5" aria-hidden />
                {storyboard.persona}
              </span>
            ) : null}
            {storyboard ? (
              <span className="inline-flex items-center gap-1">
                {storyboard.viewport.width < storyboard.viewport.height ? (
                  <Smartphone className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Monitor className="h-3.5 w-3.5" aria-hidden />
                )}
                {storyboard.viewport.width}×{storyboard.viewport.height}
              </span>
            ) : null}
            {job.model ? (
              <span>via {job.model}</span>
            ) : storyboard ? (
              // Only a job that actually has a storyboard nobody generated was
              // hand-written. A generation that failed has neither a model nor
              // a storyboard, and calling that "hand-written" sends whoever is
              // debugging it looking at the wrong half of the pipeline.
              <span>hand-written storyboard</span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Form method="post">
            <input type="hidden" name="intent" value="retry" />
            <Button
              type="submit"
              variant="outline"
              disabled={!storyboard || active}
              title={active ? 'Wait for the current render to finish.' : undefined}
            >
              Re-render
            </Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="cancel" />
            <Button type="submit" variant="ghost" disabled={!active}>
              Cancel job
            </Button>
          </Form>
        </div>
      </div>

      {/* Where in the pipeline this take stands right now. */}
      <div className="rounded-lg border bg-muted/20 px-4 py-3">
        <PipelineRail stages={pipelineStages(job)} />
      </div>

      {job.revisionFeedback ? (
        <Card>
          <CardHeader>
            <CardTitle>What this take was asked to change</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <blockquote
              data-testid="marketing-revision-feedback"
              className="border-l-2 border-indigo-300 pl-3 text-sm italic text-muted-foreground"
            >
              {job.revisionFeedback}
            </blockquote>

            {changes === null ? null : changes.length === 0 ? (
              <p
                data-testid="marketing-revision-unchanged"
                className="text-sm text-amber-700"
              >
                Nothing changed. This storyboard is identical to the one it was
                revised from, so this take will render exactly the same. Say
                which scene is wrong and what should happen instead, then try
                again.
              </p>
            ) : (
              <div>
                <p className="mb-1 text-sm font-medium">
                  What changed from the previous take
                </p>
                <ul
                  data-testid="marketing-revision-changes"
                  className="flex flex-col gap-1 text-sm"
                >
                  {changes.map((change) => (
                    <li
                      key={`${change.scene ?? 'storyboard'}-${change.field}`}
                      className="text-muted-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {change.scene ? `${change.scene} · ` : ''}
                        {change.field}
                      </span>{' '}
                      <span className="line-through">{change.before}</span> →{' '}
                      <span className="text-foreground">{change.after}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {waitingForTurn ? (
        <Card className="border-sky-300">
          <CardHeader>
            <CardTitle className="text-sky-800">Waiting its turn</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              data-testid="marketing-job-waiting-turn"
              className="text-sm text-sky-800"
            >
              A renderer is attached and filming another job right now — it
              takes one job at a time, oldest first.{' '}
              {queueAhead > 0
                ? `There ${queueAhead === 1 ? 'is' : 'are'} ${queueAhead} job${
                    queueAhead === 1 ? '' : 's'
                  } ahead of this one.`
                : 'This one is next up.'}{' '}
              It starts on its own; nothing needs restarting.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {queueStalled ? (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="text-amber-800">
              Waiting for a renderer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              data-testid="marketing-job-stalled"
              className="text-sm text-amber-800"
            >
              This job has been queued for {queuedMinutes} minute
              {queuedMinutes === 1 ? '' : 's'}, and no renderer is attached to
              this environment — nothing is picking jobs up. It is not stuck: it
              starts the moment a renderer connects to this database. Until then
              it will wait here, or you can cancel it.
            </p>
            <p className="mt-2 text-xs text-amber-700">
              How to run a renderer:{' '}
              <code>bun marketing-renderer:render-once</code> against this
              environment, or see{' '}
              <code>docs/work/marketing-media-studio.md</code>.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {job.error ? (
        <Card className="border-red-300">
          <CardHeader>
            <CardTitle className="text-red-700">This render failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              data-testid="marketing-job-error"
              className="text-sm text-red-700"
            >
              {job.error}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ——— The screening room: what this take produced ——— */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Images className="h-4 w-4 text-indigo-500" aria-hidden />
            Media
          </CardTitle>
        </CardHeader>
        <CardContent>
          {outputs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
              <Clapperboard
                className={`h-7 w-7 text-muted-foreground/50 ${active ? 'animate-pulse' : ''}`}
                aria-hidden
              />
              <p className="text-sm text-muted-foreground">
                {active
                  ? 'Nothing yet. This page refreshes while the render runs.'
                  : 'This job produced no media.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {outputs.map((output) => (
                <figure
                  key={output.key}
                  data-testid="marketing-job-output"
                  className="flex flex-col overflow-hidden rounded-lg border"
                >
                  <div className="flex items-center justify-center bg-slate-950 p-2">
                    {output.kind === 'VIDEO' ? (
                      <video
                        className="max-h-96 w-full rounded"
                        src={output.url}
                        controls
                        preload="metadata"
                      />
                    ) : (
                      <img
                        className="max-h-96 w-full rounded object-contain"
                        src={output.url}
                        alt={output.label}
                        loading="lazy"
                      />
                    )}
                  </div>
                  <figcaption className="flex items-center justify-between gap-2 bg-card px-3 py-2 text-xs text-muted-foreground">
                    <span className="truncate font-medium text-foreground">
                      {output.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {output.width && output.height ? (
                        <span className="tabular-nums">
                          {output.width}×{output.height}
                        </span>
                      ) : null}
                      {output.durationMs ? (
                        <span className="tabular-nums">
                          {Math.round(output.durationMs / 100) / 10}s
                        </span>
                      ) : null}
                      {output.bytes ? (
                        <span className="tabular-nums">
                          {formatBytes(output.bytes)}
                        </span>
                      ) : null}
                      <a
                        className="inline-flex items-center gap-1 font-medium text-foreground underline"
                        href={output.url}
                        download
                      >
                        <Download className="h-3 w-3" aria-hidden />
                        Download
                      </a>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ——— The brief this take was filmed from ——— */}
      <Card>
        <CardHeader>
          <CardTitle>Brief</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>{job.brief}</p>
          {job.audience ? (
            <p className="text-muted-foreground">Audience: {job.audience}</p>
          ) : null}
          {job.subjectLabel ? (
            <p className="text-muted-foreground">Course: {job.subjectLabel}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Filmed against <code>{job.targetUrl}</code> · requested by{' '}
            {job.createdBy.name || job.createdBy.email} ·{' '}
            {new Date(job.createdAt).toLocaleString()}
          </p>
        </CardContent>
      </Card>

      {!active && storyboard ? (
        <Card>
          <CardHeader>
            <CardTitle>Refine this render</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-3">
              <input type="hidden" name="intent" value="refine" />
              <p className="text-sm text-muted-foreground">
                Watched the take? Say what should change — the storyboard is
                revised from your notes and rendered again as a new take, with
                this one kept for comparison.
              </p>
              <textarea
                name="feedback"
                data-testid="marketing-refine-feedback"
                required
                rows={3}
                className="w-full rounded-md border bg-background p-2 text-sm"
                placeholder={
                  job.kind === 'CLIP'
                    ? 'e.g. I can barely see the prompt library — scroll down to it and hold there for a couple of seconds.'
                    : 'e.g. The second screenshot should show the class detail instead of the list.'
                }
              />
              <div>
                <Button type="submit" disabled={refining}>
                  <Clapperboard className="mr-1.5 h-4 w-4" aria-hidden />
                  {refining ? 'Writing the revision…' : 'Render a new take'}
                </Button>
              </div>
            </Form>
            {job.revisions.length > 0 ? (
              <div className="mt-4 border-t pt-3 text-sm">
                <p className="mb-1 font-medium">Takes made from this one</p>
                <ul className="flex flex-col gap-1">
                  {job.revisions.map((revision) => (
                    <li
                      key={revision.id}
                      className="flex items-baseline gap-2 text-muted-foreground"
                    >
                      <JobStatusBadge status={revision.status} />
                      <Link
                        className="shrink-0 underline"
                        to={`/app/admin/marketing-media/${revision.id}`}
                      >
                        {new Date(revision.createdAt).toLocaleString()}
                      </Link>
                      {revision.revisionFeedback ? (
                        <span className="truncate italic">
                          “{revision.revisionFeedback}”
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ——— The storyboard, drawn as the timeline it films ——— */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-4 w-4 text-indigo-500" aria-hidden />
            Storyboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          {storyboard ? (
            <>
              <ol className="flex flex-col gap-2">
                {storyboard.scenes.map((scene, index) => {
                  const seconds = sceneSeconds[index] ?? 0;
                  const share =
                    totalSceneSeconds > 0
                      ? Math.max(4, (seconds / totalSceneSeconds) * 100)
                      : 0;
                  const steps = summarizeSteps(scene);
                  return (
                    <li
                      key={scene.id}
                      data-testid="marketing-job-scene"
                      className="rounded-lg border p-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex items-baseline gap-2">
                          <span className="flex h-5 w-5 shrink-0 -translate-y-px items-center justify-center self-center rounded bg-indigo-50 text-xs font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                            {index + 1}
                          </span>
                          <span className="text-sm font-medium">{scene.id}</span>
                          {scene.goto ? (
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {scene.goto}
                            </code>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              continues on screen
                            </span>
                          )}
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          ~{seconds}s
                        </span>
                      </div>
                      {/* Screen-time bar: how much of the take this scene occupies. */}
                      <div
                        aria-hidden
                        className="mt-2 h-1 w-full rounded-full bg-muted"
                      >
                        <div
                          className="h-1 rounded-full bg-indigo-400"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {steps ? <span>{steps}</span> : null}
                        {scene.focus ? (
                          <span className="inline-flex items-center gap-1">
                            <ZoomIn className="h-3 w-3" aria-hidden />
                            push-in ×{scene.focus.scale}
                          </span>
                        ) : null}
                        {scene.startsClip ? (
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                            clip starts here
                          </span>
                        ) : null}
                      </div>
                      {scene.caption ? (
                        <p className="mt-1.5 text-sm">{scene.caption}</p>
                      ) : null}
                      {scene.overlay ? (
                        <p className="mt-1.5 inline-block rounded bg-slate-950 px-2 py-0.5 text-xs font-medium text-slate-50">
                          {scene.overlay}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Raw storyboard JSON
                </summary>
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">
                  {JSON.stringify(storyboard, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No storyboard yet.{' '}
              {job.status === 'GENERATING' ? 'One is being written now.' : null}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
