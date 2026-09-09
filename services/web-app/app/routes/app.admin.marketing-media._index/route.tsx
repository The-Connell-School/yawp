import fs from 'node:fs';
import path from 'node:path';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Form,
  Link,
  data as dataResponse,
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useRevalidator,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { z } from 'zod';
import {
  Camera,
  Clapperboard,
  Film,
  FileJson,
  Images,
  Layers,
  Palette,
  PenLine,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { JobStatusBadge } from '~/components/marketing/job-status-badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { requireAdmin, requireMutableRequest } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { deleteSmallObject } from '~/services/s3.server';
import { readRendererStatus } from '~/utils/renderer-status.server';
import {
  getMarketingMediaDir,
  getMarketingRenderTarget,
  requireMarketingStudioEnabled,
} from '~/utils/marketing-studio.server';
import {
  StoryboardGenerationError,
  generateStoryboard,
} from '~/services/marketing-storyboard.server';
import {
  MARKETING_BACKDROPS,
  MARKETING_BACKDROP_LABELS,
  MARKETING_JOB_KINDS,
  MARKETING_LIBRARY,
  describeStoryboardError,
  estimateRenderSeconds,
  parseStoryboard,
  plannedShotCount,
  safeParseStoryboard,
  type MarketingBackdrop,
  type MarketingJobKind,
  type MarketingOutput,
} from '../../../../../packages/marketing-media';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';

export const handle: BreadcrumbHandle = { breadcrumb: 'Marketing Studio' };

const ACTIVE_STATUSES = ['GENERATING', 'QUEUED', 'RENDERING'];

/**
 * Remove the files a render produced, wherever this environment keeps them.
 *
 * Best effort on purpose. A bucket that has already lost an object, or a
 * preview whose disk was reclaimed, must not strand a row in a list the
 * operator is trying to clear: orphaned media costs storage, an undeletable
 * job is a broken screen. The row goes either way.
 */
async function removeStoredMedia(rawOutputs: unknown): Promise<void> {
  const outputs = (
    Array.isArray(rawOutputs) ? rawOutputs : []
  ) as MarketingOutput[];
  if (outputs.length === 0) return;

  const mediaDir = getMarketingMediaDir();

  for (const output of outputs) {
    try {
      if (mediaDir) {
        fs.rmSync(path.join(mediaDir, output.key), { force: true });
      } else {
        await deleteSmallObject(output.key);
      }
    } catch {
      // Deliberately swallowed; see the note above.
    }
  }
}

const CreateJobSchema = z.object({
  brief: z
    .string()
    .trim()
    .min(10, 'Describe what the media should show.')
    .max(2000),
  audience: z.string().trim().max(200).optional(),
  kind: z.enum(MARKETING_JOB_KINDS),
  assignmentTypeId: z.string().trim().optional(),
  storyboardJson: z.string().trim().optional(),
  backdrop: z.enum(MARKETING_BACKDROPS).optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  requireMarketingStudioEnabled();
  await requireAdmin(request);

  const [jobs, assignmentTypes] = await Promise.all([
    prisma.marketingMediaJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        createdAt: true,
        kind: true,
        status: true,
        brief: true,
        audience: true,
        storyboard: true,
        outputs: true,
        error: true,
        createdBy: { select: { email: true, name: true } },
      },
    }),
    prisma.assignmentType.findMany({
      where: { archivedAt: null },
      orderBy: { title: 'asc' },
      take: 100,
      select: { id: true, title: true },
    }),
  ]);

  // Disk media goes through the admin-gated file route; S3 media is signed on
  // the job page, not here — a list of 25 signed URLs per poll is wasteful and
  // the thumbnail is a nicety.
  const mediaDir = getMarketingMediaDir();
  const mappedJobs = jobs.map((job) => {
    const outputs = (
      Array.isArray(job.outputs) ? job.outputs : []
    ) as MarketingOutput[];
    const poster = outputs.find((output) => output.kind === 'IMAGE');
    return {
      ...job,
      createdAt: job.createdAt.toISOString(),
      title: (job.storyboard as { title?: string } | null)?.title ?? null,
      outputCount: outputs.length,
      thumbnailUrl:
        poster && mediaDir
          ? `/app/admin/marketing-media/${job.id}/file/${encodeURIComponent(
              poster.key.split('/').at(-1) ?? ''
            )}`
          : null,
    };
  });

  return dataResponse({
    renderTarget: getMarketingRenderTarget(),
    // Whether this environment can actually film, said plainly, so a blocked
    // renderer is visible here instead of only in a container log.
    rendererStatus: readRendererStatus(mediaDir),
    assignmentTypes,
    library: MARKETING_LIBRARY.map((entry) => {
      // Library storyboards are hand-verified and covered by a test, so this
      // parse is a type refinement, not a gamble.
      const storyboard = parseStoryboard(entry.storyboard);
      return {
        slug: entry.slug,
        title: entry.title,
        description: entry.description,
        kind: entry.kind,
        sceneCount: storyboard.scenes.length,
        estimatedSeconds: estimateRenderSeconds(storyboard),
        shotCount: plannedShotCount(storyboard),
      };
    }),
    stats: {
      // A draft is not in flight — nothing is happening to it until a person
      // reads the plan — so it gets counted, and shown, on its own.
      awaitingYou: mappedJobs.filter((job) => job.status === 'DRAFT').length,
      inFlight: mappedJobs.filter((job) => ACTIVE_STATUSES.includes(job.status))
        .length,
      finished: mappedJobs.filter((job) => job.status === 'SUCCEEDED').length,
      files: mappedJobs.reduce((total, job) => total + job.outputCount, 0),
    },
    jobs: mappedJobs,
  });
}

/**
 * The backdrop chosen on the form, applied to whatever storyboard is about to
 * be filmed. It is set here rather than asked of the model or written into the
 * library, so one library entry renders on any ground.
 */
function withBackdrop<T extends object>(
  storyboard: T,
  backdrop: MarketingBackdrop
): T & { backdrop: MarketingBackdrop } {
  return { ...storyboard, backdrop };
}

function readBackdrop(formData: FormData): MarketingBackdrop | null {
  const raw = String(formData.get('backdrop') ?? '').trim();
  if (!raw) return 'gradient';
  return (MARKETING_BACKDROPS as readonly string[]).includes(raw)
    ? (raw as MarketingBackdrop)
    : null;
}

export async function action({ request }: ActionFunctionArgs) {
  requireMarketingStudioEnabled();
  const admin = await requireAdmin(request);
  await requireMutableRequest(request);

  const formData = await request.formData();

  if (formData.get('intent') === 'delete') {
    const jobId = String(formData.get('jobId') ?? '');
    const job = await prisma.marketingMediaJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, outputs: true },
    });

    if (!job) {
      return dataResponse(
        { error: 'That render no longer exists.' },
        { status: 404 }
      );
    }

    // The renderer claims a job for the length of a take. Deleting the row out
    // from under it strands the worker mid-film and orphans whatever it
    // uploads next, so this waits rather than racing it.
    if (job.status === 'RENDERING') {
      return dataResponse(
        {
          error:
            'That render is being filmed right now. Wait for it to finish, then delete it.',
        },
        { status: 409 }
      );
    }

    await removeStoredMedia(job.outputs);
    // Revisions written from this job survive: the relation is onDelete
    // SetNull, so deleting a take never takes its follow-ups with it.
    await prisma.marketingMediaJob.delete({ where: { id: job.id } });
    return redirect('/app/admin/marketing-media');
  }

  // The whole library at once. Same path as a single library render, eight
  // times over: no model in the loop, so every job is queued before this
  // returns and the gallery fills itself as the renderer works through them.
  const chosenBackdrop = readBackdrop(formData);
  if (chosenBackdrop === null) {
    return dataResponse({ error: 'That backdrop is not offered.' }, { status: 400 });
  }

  if (formData.get('intent') === 'render-showcase') {
    const renderTarget = getMarketingRenderTarget();
    for (const entry of MARKETING_LIBRARY) {
      await prisma.marketingMediaJob.create({
        data: {
          createdById: admin.id,
          kind: entry.kind,
          status: 'QUEUED',
          brief: entry.description,
          audience: null,
          subjectType: 'FEATURE',
          subjectId: null,
          subjectLabel: entry.title,
          storyboard: withBackdrop(entry.storyboard as object, chosenBackdrop),
          model: null,
          targetUrl: renderTarget,
        },
        select: { id: true },
      });
    }
    return redirect('/app/admin/marketing-media');
  }

  // The library path: a hand-verified storyboard rendered as-is, with no
  // model in the loop. This is the reliable one-click route to media.
  if (formData.get('intent') === 'render-library') {
    const slug = String(formData.get('librarySlug') ?? '');
    const entry = MARKETING_LIBRARY.find((item) => item.slug === slug);
    if (!entry) {
      return dataResponse(
        { error: 'That library entry does not exist.' },
        { status: 400 }
      );
    }
    const job = await prisma.marketingMediaJob.create({
      data: {
        createdById: admin.id,
        kind: entry.kind,
        status: 'QUEUED',
        brief: entry.description,
        audience: null,
        subjectType: 'FEATURE',
        subjectId: null,
        subjectLabel: entry.title,
        storyboard: withBackdrop(entry.storyboard as object, chosenBackdrop),
        model: null,
        targetUrl: getMarketingRenderTarget(),
      },
      select: { id: true },
    });
    return redirect(`/app/admin/marketing-media/${job.id}`);
  }

  const parsed = CreateJobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return dataResponse(
      { error: parsed.error.issues.map((issue) => issue.message).join('; ') },
      { status: 400 }
    );
  }

  const { brief, audience, kind, assignmentTypeId, storyboardJson } =
    parsed.data;
  const renderTarget = getMarketingRenderTarget();

  const subject = assignmentTypeId
    ? await prisma.assignmentType.findUnique({
        where: { id: assignmentTypeId },
        select: { id: true, title: true },
      })
    : null;

  // The pasted-storyboard path exists so an admin can correct what the model
  // wrote and re-run it without another generation, and so this surface can be
  // exercised without an LLM.
  if (storyboardJson) {
    let candidate: unknown;
    try {
      candidate = JSON.parse(storyboardJson);
    } catch (err) {
      return dataResponse(
        {
          error: `Storyboard JSON is not valid JSON: ${(err as Error).message}`,
        },
        { status: 400 }
      );
    }

    const result = safeParseStoryboard(candidate);
    if (!result.success) {
      return dataResponse(
        { error: describeStoryboardError(result.error) },
        { status: 400 }
      );
    }

    const job = await prisma.marketingMediaJob.create({
      data: {
        createdById: admin.id,
        kind,
        status: 'QUEUED',
        brief,
        audience: audience || null,
        subjectType: subject ? 'ASSIGNMENT_TYPE' : 'FEATURE',
        subjectId: subject?.id ?? null,
        subjectLabel: subject?.title ?? null,
        storyboard: withBackdrop(result.data, chosenBackdrop),
        model: null,
        targetUrl: renderTarget,
      },
      select: { id: true },
    });

    return redirect(`/app/admin/marketing-media/${job.id}`);
  }

  const job = await prisma.marketingMediaJob.create({
    data: {
      createdById: admin.id,
      kind,
      status: 'GENERATING',
      brief,
      audience: audience || null,
      subjectType: subject ? 'ASSIGNMENT_TYPE' : 'FEATURE',
      subjectId: subject?.id ?? null,
      subjectLabel: subject?.title ?? null,
      targetUrl: renderTarget,
    },
    select: { id: true },
  });

  try {
    const generated = await generateStoryboard({
      brief,
      audience,
      kind: kind as MarketingJobKind,
      subject: subject
        ? { type: 'ASSIGNMENT_TYPE', label: subject.title }
        : null,
    });

    await prisma.marketingMediaJob.update({
      where: { id: job.id },
      data: {
        // Not QUEUED: a generated storyboard is the model's reading of a
        // brief, and the operator has not seen it yet. It waits as a plan
        // they approve, so a misread costs a glance instead of a render.
        status: 'DRAFT',
        storyboard: withBackdrop(generated.storyboard, chosenBackdrop),
        model: generated.model,
      },
    });
  } catch (err) {
    // The job row survives a generation failure on purpose: the admin needs to
    // see why the brief did not become a storyboard.
    await prisma.marketingMediaJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error:
          err instanceof StoryboardGenerationError
            ? err.message
            : `Storyboard generation failed: ${err instanceof Error ? err.message : String(err)}`,
        finishedAt: new Date(),
      },
    });
  }

  return redirect(`/app/admin/marketing-media/${job.id}`);
}

function formatScreenTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function KindGlyph({ kind, className }: { kind: string; className?: string }) {
  return kind === 'CLIP' ? (
    <Film className={className} aria-hidden />
  ) : (
    <Camera className={className} aria-hidden />
  );
}

/**
 * Open / Delete for one row of the render list.
 *
 * The delete posts through its own fetcher rather than the page form so a
 * refusal ("that one is being filmed right now") lands next to the row it is
 * about, instead of surfacing as an error on the New render card far above.
 */
function JobRowActions({ jobId, title }: { jobId: string; title: string }) {
  const fetcher = useFetcher<{ error?: string }>();
  const deleting = fetcher.state !== 'idle';
  const error = fetcher.data?.error;

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="outline" asChild>
          <Link to={`/app/admin/marketing-media/${jobId}`}>Open</Link>
        </Button>
        <ConfirmationDialog
          title="Delete this render?"
          description={`“${title}” and any files it produced will be removed. This cannot be undone.`}
          confirmText="Delete"
          cancelText="Keep"
          variant="destructive"
          onConfirm={() =>
            fetcher.submit({ intent: 'delete', jobId }, { method: 'post' })
          }
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            data-testid="marketing-job-delete"
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </ConfirmationDialog>
      </div>
      {error ? (
        <p
          data-testid="marketing-job-delete-error"
          className="mt-1 text-right text-xs text-red-600"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}

/**
 * The ground itself, at thumbnail size — the only honest way to show what a
 * backdrop is. Mirrors the renderer's grounds in frame.ts.
 */
const BACKDROP_SWATCHES: Record<MarketingBackdrop, string> = {
  gradient:
    'linear-gradient(125deg, #ff9ecd 0%, #f95f9b 22%, #a855f7 48%, #38bdf8 74%, #fde047 100%)',
  slate: '#0f172a',
  paper: '#f5f1ec',
  none: 'transparent',
};

function BackdropSwatch({ backdrop }: { backdrop: MarketingBackdrop }) {
  if (backdrop === 'none') {
    return (
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dashed text-muted-foreground"
      >
        <Palette className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="mt-0.5 h-5 w-5 shrink-0 rounded border"
      style={{ background: BACKDROP_SWATCHES[backdrop] }}
    />
  );
}

/** One stage of the brief-to-media pipeline, drawn under the composer. */
function PipelineStep({
  icon,
  label,
  detail,
  last = false,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <li className="flex min-w-0 flex-1 items-start gap-2">
      <div className="flex flex-col items-center self-stretch">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
          {icon}
        </div>
        {last ? null : (
          <div className="mt-1 hidden w-px flex-1 bg-border md:block" />
        )}
      </div>
      <div className="min-w-0 pb-2">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </li>
  );
}

export default function Route() {
  const { jobs, assignmentTypes, renderTarget, library, stats, rendererStatus } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [showStoryboard, setShowStoryboard] = useState(false);
  const [kind, setKind] = useState<'STILLS' | 'CLIP'>('STILLS');
  // Shared by the brief form and the one-click renders below, so a library
  // entry or the whole showcase films on whatever ground is selected here.
  const [backdrop, setBackdrop] = useState<MarketingBackdrop>('gradient');
  const busy = navigation.state === 'submitting';

  // Renders finish in a worker, not in this tab. While anything is generating,
  // queued, or filming, the list checks back so statuses move on their own.
  const anyActive = jobs.some((job) => ACTIVE_STATUSES.includes(job.status));
  useEffect(() => {
    if (!anyActive) return;
    const timer = setInterval(() => revalidator.revalidate(), 10_000);
    return () => clearInterval(timer);
  }, [anyActive, revalidator]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 pb-16">
      {/* ——— Studio marquee ——— */}
      <header className="relative overflow-hidden rounded-xl border bg-slate-950 px-6 py-6 text-slate-50 md:px-8">
        {/* Sprocket holes: the film-strip edge that makes it read as a studio. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-3 pt-2 opacity-30"
        >
          {Array.from({ length: 18 }).map((_, index) => (
            <span key={index} className="h-2 w-3 rounded-sm bg-slate-500" />
          ))}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-3 pb-2 opacity-30"
        >
          {Array.from({ length: 18 }).map((_, index) => (
            <span key={index} className="h-2 w-3 rounded-sm bg-slate-500" />
          ))}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-indigo-300">
              <Clapperboard className="h-5 w-5" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-widest">
                YAWP! on camera
              </span>
            </div>
            {/* Explicit color: the app's global heading style would otherwise
                paint this near-black on the dark marquee. */}
            <h1 className="mt-1 text-2xl font-semibold text-slate-50 md:text-3xl">
              Marketing Studio
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Describe a feature or a course. The studio writes a storyboard,
              films it against the demo environment, and hands back stills or a
              short silent clip — ready for a deck, a landing page, or a feed.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Filming <code className="font-mono">{renderTarget}</code> — demo
              data only, never real student work.
            </p>
            {/* A queued job that never moves used to be indistinguishable from
                a busy renderer. This is the difference, on the screen where
                somebody is waiting. */}
            {rendererStatus?.state === 'ready' && !rendererStatus.stale ? (
              <p
                data-testid="marketing-renderer-status"
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Renderer ready
              </p>
            ) : (
              <p
                data-testid="marketing-renderer-status"
                className="mt-2 inline-flex max-w-xl items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200"
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>
                  {rendererStatus?.state === 'blocked' && rendererStatus.reason
                    ? `No renderer can film here: ${rendererStatus.reason}. Renders will wait until it can start.`
                    : rendererStatus?.state === 'starting'
                      ? 'A renderer is starting up — the first render after a deploy waits for it to install a browser.'
                      : rendererStatus?.stale
                        ? 'The renderer that was here has stopped reporting. Renders will wait until one is back.'
                        : 'No renderer has reported in yet. Renders will queue and wait for one.'}
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/10 text-slate-50 hover:bg-white/20"
              asChild
            >
              <Link to="/app/admin/marketing-media/gallery">
                <Images className="mr-1.5 h-4 w-4" aria-hidden />
                Gallery
                {stats.files > 0 ? (
                  <span className="ml-1.5 rounded-full bg-white/15 px-1.5 text-xs tabular-nums">
                    {stats.files}
                  </span>
                ) : null}
              </Link>
            </Button>
            <Form method="post">
              <input type="hidden" name="intent" value="render-showcase" />
              <input type="hidden" name="backdrop" value={backdrop} />
              <Button
                type="submit"
                size="sm"
                disabled={busy}
                className="bg-indigo-500 text-white hover:bg-indigo-400"
                title="Queue every library storyboard"
              >
                <Clapperboard className="mr-1.5 h-4 w-4" aria-hidden />
                Render the showcase
              </Button>
            </Form>
          </div>
          <dl className="flex gap-6 text-right">
            {stats.awaitingYou > 0 ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-indigo-300">
                  Awaiting you
                </dt>
                <dd className="text-2xl font-semibold tabular-nums text-indigo-300">
                  {stats.awaitingYou}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                In flight
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {stats.inFlight}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                Finished takes
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {stats.finished}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                Files produced
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {stats.files}
              </dd>
            </div>
          </dl>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        {/* ——— Brief composer ——— */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-indigo-500" aria-hidden />
              New render
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="brief">What should this show?</Label>
                <Textarea
                  id="brief"
                  name="brief"
                  rows={3}
                  required
                  className="resize-y"
                  placeholder="A teacher opening a class, reading a submitted essay, and leaving rubric feedback."
                />
              </div>

              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">
                  Deliverable
                </legend>
                {/* The real input: labelled, keyboard-reachable, e2e-addressable.
                    The cards below mirror it for pointing devices. */}
                <select
                  id="kind"
                  name="kind"
                  value={kind}
                  onChange={(event) =>
                    setKind(event.target.value as 'STILLS' | 'CLIP')
                  }
                  className="sr-only"
                  aria-label="Deliverable"
                >
                  <option value="STILLS">Screenshots</option>
                  <option value="CLIP">Feature clip (5–15s, silent)</option>
                </select>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={kind === 'STILLS'}
                    onClick={() => setKind('STILLS')}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      kind === 'STILLS'
                        ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                        : 'hover:bg-muted/60'
                    }`}
                  >
                    <Camera
                      className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500"
                      aria-hidden
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Screenshots
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        A set of framed stills, one per scene.
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={kind === 'CLIP'}
                    onClick={() => setKind('CLIP')}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      kind === 'CLIP'
                        ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                        : 'hover:bg-muted/60'
                    }`}
                  >
                    <Film
                      className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500"
                      aria-hidden
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Feature clip
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        5–15 seconds, silent, caption overlays.
                      </span>
                    </span>
                  </button>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Backdrop</legend>
                <select
                  id="backdrop"
                  name="backdrop"
                  value={backdrop}
                  onChange={(event) =>
                    setBackdrop(event.target.value as MarketingBackdrop)
                  }
                  className="sr-only"
                  aria-label="Backdrop"
                >
                  {MARKETING_BACKDROPS.map((option) => (
                    <option key={option} value={option}>
                      {MARKETING_BACKDROP_LABELS[option].label}
                    </option>
                  ))}
                </select>
                <div className="grid gap-2 sm:grid-cols-2">
                  {MARKETING_BACKDROPS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={backdrop === option}
                      onClick={() => setBackdrop(option)}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                        backdrop === option
                          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                          : 'hover:bg-muted/60'
                      }`}
                    >
                      <BackdropSwatch backdrop={option} />
                      <span>
                        <span className="block text-sm font-medium">
                          {MARKETING_BACKDROP_LABELS[option].label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {MARKETING_BACKDROP_LABELS[option].detail}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="audience">Audience</Label>
                  <Input
                    id="audience"
                    name="audience"
                    placeholder="Department chairs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="assignmentTypeId">Course (optional)</Label>
                  <select
                    id="assignmentTypeId"
                    name="assignmentTypeId"
                    defaultValue=""
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">No specific course</option>
                    {assignmentTypes.map((assignmentType) => (
                      <option key={assignmentType.id} value={assignmentType.id}>
                        {assignmentType.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setShowStoryboard((value) => !value)}
                >
                  <FileJson className="mr-1 h-3.5 w-3.5" aria-hidden />
                  {showStoryboard
                    ? 'Hide storyboard JSON'
                    : 'Advanced: paste a storyboard'}
                </Button>
                {showStoryboard ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <Label htmlFor="storyboardJson">Storyboard JSON</Label>
                    <Textarea
                      id="storyboardJson"
                      name="storyboardJson"
                      rows={8}
                      className="font-mono text-xs"
                      placeholder='{"slug":"teacher-loop","title":"...","scenes":[...]}'
                    />
                    <p className="text-xs text-muted-foreground">
                      Skips generation and renders this storyboard as written.
                    </p>
                  </div>
                ) : null}
              </div>

              {actionData?.error ? (
                <p
                  data-testid="marketing-form-error"
                  className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
                >
                  {actionData.error}
                </p>
              ) : null}

              <div>
                <Button type="submit" disabled={busy}>
                  <Clapperboard className="mr-1.5 h-4 w-4" aria-hidden />
                  {busy ? 'Working…' : 'Queue render'}
                </Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* ——— How a brief becomes media ——— */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How a brief becomes media</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1">
              <PipelineStep
                icon={<PenLine className="h-3.5 w-3.5" aria-hidden />}
                label="Storyboard"
                detail="A model turns the brief into scenes, validated against an allow-list of routes."
              />
              <PipelineStep
                icon={<Clapperboard className="h-3.5 w-3.5" aria-hidden />}
                label="Filming"
                detail="A renderer walks the demo environment as a seeded persona and captures each scene."
              />
              <PipelineStep
                icon={<Images className="h-3.5 w-3.5" aria-hidden />}
                label="Media"
                detail="Framed stills or an H.264 clip land on the job page, ready to download."
                last
              />
            </ol>
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              Watched a take and want it different? Open it and say what should
              change — the storyboard is revised from your notes and filmed
              again as a new take.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ——— Library ——— */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-500" aria-hidden />
          <h2 className="text-lg font-semibold">Library</h2>
        </div>
        <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
          Hand-verified storyboards of the moments schools ask about — frequent
          low-stakes writing, criterion-referenced feedback, the grading
          pipeline, built-in teacher development. One click renders fresh media;
          no AI writing step, so these come out right every time. They film on
          the backdrop selected above.
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {library.map((entry) => (
            <div
              key={entry.slug}
              data-testid="marketing-library-entry"
              className="group flex flex-col justify-between gap-3 rounded-lg border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                      <KindGlyph kind={entry.kind} className="h-4 w-4" />
                    </span>
                    {entry.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {entry.kind === 'CLIP' ? 'Clip' : 'Stills'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {entry.description}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3 w-3" aria-hidden />
                    {entry.sceneCount} scene{entry.sceneCount === 1 ? '' : 's'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    {entry.kind === 'CLIP' ? (
                      <>
                        <Timer className="h-3 w-3" aria-hidden />~
                        {formatScreenTime(entry.estimatedSeconds)}
                      </>
                    ) : (
                      <>
                        <Camera className="h-3 w-3" aria-hidden />
                        {entry.shotCount} shot{entry.shotCount === 1 ? '' : 's'}
                      </>
                    )}
                  </span>
                </span>
                <Form method="post">
                  <input type="hidden" name="intent" value="render-library" />
                  <input type="hidden" name="librarySlug" value={entry.slug} />
                  <input type="hidden" name="backdrop" value={backdrop} />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                  >
                    <Clapperboard className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Render
                  </Button>
                </Form>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ——— Recent renders ——— */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Film className="h-4 w-4 text-indigo-500" aria-hidden />
          <h2 className="text-lg font-semibold">Recent renders</h2>
        </div>
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
            <Clapperboard
              className="h-8 w-8 text-muted-foreground/50"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">
              Nothing rendered yet. Write a brief above, or render a library
              storyboard — first take lands here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[132px]">Take</TableHead>
                  <TableHead>Render</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Files</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="py-2">
                      <Link
                        to={`/app/admin/marketing-media/${job.id}`}
                        className="block h-[66px] w-[112px] overflow-hidden rounded-md border bg-slate-950"
                        aria-label={`Open ${job.title ?? 'Untitled'}`}
                      >
                        {job.thumbnailUrl ? (
                          <img
                            src={job.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-slate-500">
                            <KindGlyph
                              kind={job.kind}
                              className={`h-5 w-5 ${
                                ACTIVE_STATUSES.includes(job.status) ? 'animate-pulse' : ''
                              }`}
                            />
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <Link
                        to={`/app/admin/marketing-media/${job.id}`}
                        className="font-medium hover:underline"
                      >
                        {job.title ?? 'Untitled'}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {job.brief}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <KindGlyph
                          kind={job.kind}
                          className="h-3.5 w-3.5 text-muted-foreground"
                        />
                        {job.kind === 'CLIP' ? 'Clip' : 'Stills'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {job.outputCount}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-xs text-muted-foreground"
                      title={new Date(job.createdAt).toLocaleString()}
                    >
                      {formatWhen(job.createdAt)}
                    </TableCell>
                    <TableCell>
                      <JobRowActions
                        jobId={job.id}
                        title={job.title ?? 'Untitled'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
