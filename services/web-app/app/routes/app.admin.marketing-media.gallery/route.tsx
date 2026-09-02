import { useMemo, useState } from 'react';
import {
  Form,
  Link,
  data as dataResponse,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import {
  ArrowLeft,
  Camera,
  Clapperboard,
  Download,
  ExternalLink,
  Film,
  Images,
  Play,
} from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '~/components/ui/dialog';
import { requireAdmin } from '~/utils/auth.server';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { prisma } from '~/utils/db.server';
import { getSignedGetUrl } from '~/services/s3.server';
import {
  getMarketingMediaDir,
  requireMarketingStudioEnabled,
} from '~/utils/marketing-studio.server';
import { type MarketingOutput } from '../../../../../packages/marketing-media';

export const handle: BreadcrumbHandle = { breadcrumb: 'Gallery' };

export type GalleryItem = {
  /** Unique across the gallery: the output's storage key. */
  id: string;
  key: string;
  jobId: string;
  jobTitle: string;
  jobKind: string;
  kind: MarketingOutput['kind'];
  label: string;
  url: string;
  contentType: string;
  bytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  finishedAt: string | null;
  /** For clips: the take's first still, shown before playback. */
  posterUrl?: string;
};

type GalleryJob = {
  id: string;
  kind: string;
  status: string;
  createdAt: Date;
  finishedAt: Date | null;
  subjectLabel: string | null;
  storyboard: unknown;
  outputs: unknown;
};

const RAW_SUFFIX = '-raw.png';

function basename(key: string): string {
  return key.split('/').at(-1) ?? key;
}

/**
 * The finished work, one card per file, in the order the jobs are given
 * (newest first). Raw captures kept beside framed stills are working files,
 * not the show: they are skipped when their framed counterpart exists, and
 * stay reachable from the job page.
 */
export function collectGalleryItems(
  jobs: GalleryJob[],
  urlFor: (jobId: string, key: string) => string
): GalleryItem[] {
  const items: GalleryItem[] = [];
  for (const job of jobs) {
    const outputs = (
      Array.isArray(job.outputs) ? job.outputs : []
    ) as MarketingOutput[];
    const names = new Set(outputs.map((output) => basename(output.key)));
    const poster = outputs.find((output) => output.kind === 'IMAGE');
    const title =
      (job.storyboard as { title?: string } | null)?.title ??
      job.subjectLabel ??
      'Untitled';

    for (const output of outputs) {
      const name = basename(output.key);
      if (name.endsWith(RAW_SUFFIX)) {
        const framed = `${name.slice(0, -RAW_SUFFIX.length)}.png`;
        if (names.has(framed)) continue;
      }
      items.push({
        id: output.key,
        key: output.key,
        jobId: job.id,
        jobTitle: title,
        jobKind: job.kind,
        kind: output.kind,
        label: output.label,
        url: urlFor(job.id, output.key),
        contentType: output.contentType,
        bytes: output.bytes,
        width: output.width,
        height: output.height,
        durationMs: output.durationMs,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        ...(output.kind === 'VIDEO' && poster
          ? { posterUrl: urlFor(job.id, poster.key) }
          : {}),
      });
    }
  }
  return items;
}

export async function loader({ request }: LoaderFunctionArgs) {
  requireMarketingStudioEnabled();
  await requireAdmin(request);

  const jobs = await prisma.marketingMediaJob.findMany({
    where: { status: 'SUCCEEDED' },
    orderBy: { finishedAt: 'desc' },
    take: 200,
    select: {
      id: true,
      kind: true,
      status: true,
      createdAt: true,
      finishedAt: true,
      subjectLabel: true,
      storyboard: true,
      outputs: true,
    },
  });

  // Never public either way: disk media goes through the admin-gated file
  // route; S3 media gets a short-lived signed URL.
  const mediaDir = getMarketingMediaDir();
  const collected = collectGalleryItems(jobs, (jobId, key) =>
    mediaDir
      ? `/app/admin/marketing-media/${jobId}/file/${encodeURIComponent(basename(key))}`
      : key
  );
  const items = mediaDir
    ? collected
    : await Promise.all(
        collected.map(async (item) => ({
          ...item,
          url: await getSignedGetUrl(item.key, 60 * 60),
          ...(item.posterUrl
            ? { posterUrl: await getSignedGetUrl(item.posterUrl, 60 * 60) }
            : {}),
        }))
      );

  return dataResponse({
    items,
    counts: {
      all: items.length,
      stills: items.filter((item) => item.kind === 'IMAGE').length,
      clips: items.filter((item) => item.kind === 'VIDEO').length,
    },
  });
}

type Filter = 'all' | 'stills' | 'clips';

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms?: number): string | null {
  if (!ms) return null;
  return `${(Math.round(ms / 100) / 10).toFixed(1)}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function Thumb({ item, large = false }: { item: GalleryItem; large?: boolean }) {
  if (item.kind === 'VIDEO') {
    return (
      <video
        className={large ? 'max-h-[70vh] w-full rounded-md' : 'h-full w-full object-cover'}
        src={item.url}
        poster={item.posterUrl}
        controls={large}
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  return (
    <img
      className={large ? 'max-h-[70vh] w-full rounded-md object-contain' : 'h-full w-full object-cover'}
      src={item.url}
      alt={item.label}
      loading="lazy"
    />
  );
}

function FilterPill({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? 'border-indigo-400 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200'
          : 'text-muted-foreground hover:bg-muted/60'
      }`}
    >
      {children}
      <span className="rounded-full bg-background/70 px-1.5 text-xs tabular-nums">
        {count}
      </span>
    </button>
  );
}

export default function Route() {
  const { items, counts } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      items.filter((item) =>
        filter === 'all'
          ? true
          : filter === 'stills'
            ? item.kind === 'IMAGE'
            : item.kind === 'VIDEO'
      ),
    [items, filter]
  );
  const open = items.find((item) => item.id === openId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/app/admin/marketing-media"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Studio
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            <Images className="h-6 w-6 text-indigo-500" aria-hidden />
            Gallery
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every finished take, ready to drop into a deck, a page, or a feed.
            Framed stills at 2×; clips as silent H.264.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
            All
          </FilterPill>
          <FilterPill active={filter === 'stills'} onClick={() => setFilter('stills')} count={counts.stills}>
            <Camera className="h-3.5 w-3.5" aria-hidden />
            Stills
          </FilterPill>
          <FilterPill active={filter === 'clips'} onClick={() => setFilter('clips')} count={counts.clips}>
            <Film className="h-3.5 w-3.5" aria-hidden />
            Clips
          </FilterPill>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <Clapperboard className="h-9 w-9 text-muted-foreground/50" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">
            {items.length === 0
              ? 'Nothing finished yet. Render the whole library in one click and come back in a few minutes.'
              : 'Nothing of this kind yet.'}
          </p>
          {items.length === 0 ? (
            <Form method="post" action="/app/admin/marketing-media?index">
              <input type="hidden" name="intent" value="render-showcase" />
              <Button type="submit">
                <Clapperboard className="mr-1.5 h-4 w-4" aria-hidden />
                Render the showcase
              </Button>
            </Form>
          ) : null}
        </div>
      ) : (
        <ul
          data-testid="marketing-gallery"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {visible.map((item) => (
            <li
              key={item.id}
              data-testid="marketing-gallery-item"
              className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-lg"
            >
              <button
                type="button"
                onClick={() => setOpenId(item.id)}
                className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${item.label}`}
              >
                <Thumb item={item} />
                {item.kind === 'VIDEO' ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition-transform group-hover:scale-110">
                      <Play className="ml-0.5 h-5 w-5" aria-hidden />
                    </span>
                  </span>
                ) : null}
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                  {item.kind === 'VIDEO' ? (
                    <Film className="h-3 w-3" aria-hidden />
                  ) : (
                    <Camera className="h-3 w-3" aria-hidden />
                  )}
                  {item.kind === 'VIDEO' ? formatDuration(item.durationMs) ?? 'Clip' : 'Still'}
                </span>
              </button>
              <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.jobTitle}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.label}
                    {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
                    {item.finishedAt ? ` · ${formatDate(item.finishedAt)}` : ''}
                  </div>
                </div>
                <a
                  href={item.url}
                  download
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Download ${item.label}`}
                >
                  <Download className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        <DialogContent className="max-w-5xl">
          {open ? (
            <div className="flex flex-col gap-3">
              <DialogTitle className="flex items-center gap-2 text-lg">
                {open.jobTitle}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  {open.label}
                </span>
              </DialogTitle>
              <DialogDescription className="sr-only">
                Preview of {open.label} from {open.jobTitle}
              </DialogDescription>
              <div className="flex items-center justify-center rounded-lg bg-slate-950 p-2">
                <Thumb item={open} large />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-3 tabular-nums">
                  {open.width && open.height ? <span>{open.width}×{open.height}</span> : null}
                  {formatDuration(open.durationMs) ? <span>{formatDuration(open.durationMs)}</span> : null}
                  {open.bytes ? <span>{formatBytes(open.bytes)}</span> : null}
                  <span>{open.contentType}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/app/admin/marketing-media/${open.jobId}`}>
                      <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Open job
                    </Link>
                  </Button>
                  <Button size="sm" asChild>
                    <a href={open.url} download>
                      <Download className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Download
                    </a>
                  </Button>
                </span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
