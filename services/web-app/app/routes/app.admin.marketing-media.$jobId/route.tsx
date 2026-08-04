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
import { useEffect } from 'react';
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
  estimateRenderSeconds,
  safeParseStoryboard,
  type MarketingJobStatus,
  type MarketingOutput,
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
      revisions: {
        select: { id: true, status: true, createdAt: true },
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

export default function Route() {
  const {
    job,
    outputs,
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

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm underline" to="/app/admin/marketing-media">
            ← All renders
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">
            {storyboard?.title ?? 'Untitled render'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <JobStatusBadge status={job.status} />
            {job.parentJobId ? (
              <Link
                className="underline"
                to={`/app/admin/marketing-media/${job.parentJobId}`}
              >
                Revision of an earlier take
              </Link>
            ) : null}
            <span>{job.kind === 'CLIP' ? 'Silent clip' : 'Screenshots'}</span>
            {estimatedSeconds ? (
              <span>~{estimatedSeconds}s of screen time</span>
            ) : null}
            {job.model ? (
              <span>via {job.model}</span>
            ) : (
              <span>hand-written storyboard</span>
            )}
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

      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
        </CardHeader>
        <CardContent>
          {outputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {active
                ? 'Nothing yet. This page refreshes while the render runs.'
                : 'This job produced no media.'}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {outputs.map((output) => (
                <figure
                  key={output.key}
                  data-testid="marketing-job-output"
                  className="flex flex-col gap-2"
                >
                  {output.kind === 'VIDEO' ? (
                    <video
                      className="w-full rounded border"
                      src={output.url}
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <img
                      className="w-full rounded border"
                      src={output.url}
                      alt={output.label}
                      loading="lazy"
                    />
                  )}
                  <figcaption className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{output.label}</span>
                    <a className="underline" href={output.url} download>
                      Download
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
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
                className="w-full rounded border bg-background p-2 text-sm"
                placeholder={
                  job.kind === 'CLIP'
                    ? 'e.g. I can barely see the prompt library — scroll down to it and hold there for a couple of seconds.'
                    : 'e.g. The second screenshot should show the class detail instead of the list.'
                }
              />
              <div>
                <Button type="submit" disabled={refining}>
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
                      className="flex items-center gap-2 text-muted-foreground"
                    >
                      <JobStatusBadge status={revision.status} />
                      <Link
                        className="underline"
                        to={`/app/admin/marketing-media/${revision.id}`}
                      >
                        {new Date(revision.createdAt).toLocaleString()}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Storyboard</CardTitle>
        </CardHeader>
        <CardContent>
          {storyboard ? (
            <>
              <ol className="flex flex-col gap-2 text-sm">
                {storyboard.scenes.map((scene, index) => (
                  <li
                    key={scene.id}
                    data-testid="marketing-job-scene"
                    className="rounded border p-2"
                  >
                    <div className="font-medium">
                      {index + 1}. {scene.id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {scene.goto ? (
                        <code>{scene.goto}</code>
                      ) : (
                        'continues on screen'
                      )}
                      {scene.steps.length > 0
                        ? ` · ${scene.steps.length} step${scene.steps.length === 1 ? '' : 's'}`
                        : null}
                    </div>
                    {scene.caption ? (
                      <div className="mt-1">{scene.caption}</div>
                    ) : null}
                  </li>
                ))}
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
