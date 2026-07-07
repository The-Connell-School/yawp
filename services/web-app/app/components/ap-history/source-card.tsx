import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ImageIcon,
  ZoomInIcon,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';

export type ApHistorySourceCardData = {
  externalKey: string;
  position: number;
  title: string;
  attribution: string;
  body: string;
  caption?: string | null;
  mediaType?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  provenanceUrl?: string | null;
};

/**
 * The URL for a curated source image served from our own origin. Reliable even
 * where external image hosts are blocked (e.g. previews with no web egress).
 */
export function apHistorySourceImageUrl(externalKey: string): string {
  return `/api/image/ap-history-source/${encodeURIComponent(externalKey)}`;
}

/**
 * Shared rendering for a single AP History DBQ source. Used by both the student
 * runtime panel and the teacher review preview so the two always match. Prefers
 * the self-hosted image, then falls back to the external URL, then to a link.
 */
export function ApHistorySourceCard({
  source,
}: {
  source: ApHistorySourceCardData;
}) {
  const [imageExpanded, setImageExpanded] = useState(false);
  const [srcIndex, setSrcIndex] = useState(0);
  const isImageSource = source.mediaType === 'image';

  const imageCandidates = useMemo(() => {
    const candidates = [apHistorySourceImageUrl(source.externalKey)];
    if (source.imageUrl) candidates.push(source.imageUrl);
    return candidates;
  }, [source.externalKey, source.imageUrl]);

  const activeSrc = imageCandidates[srcIndex];
  const exhausted = srcIndex >= imageCandidates.length;
  const showImage = isImageSource && Boolean(activeSrc) && !exhausted;

  return (
    <section className="rounded-md border bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" size="sm">
          Source {source.position}
        </Badge>
        <h3 className="text-sm font-semibold">{source.title}</h3>
        {isImageSource ? (
          <Badge variant="secondary" size="sm">
            <ImageIcon className="mr-1 h-3 w-3" />
            Visual source
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{source.attribution}</p>

      {showImage ? (
        <figure className="mt-2">
          <button
            type="button"
            onClick={() => setImageExpanded((expanded) => !expanded)}
            className="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border bg-slate-50"
          >
            <img
              src={activeSrc}
              alt={source.imageAlt ?? source.title}
              onError={() => setSrcIndex((index) => index + 1)}
              loading="lazy"
              className={`w-full object-contain transition-all ${
                imageExpanded ? 'max-h-[800px]' : 'max-h-[400px]'
              }`}
            />
            <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
              <ZoomInIcon className="mr-1 inline h-3 w-3" />
              {imageExpanded ? 'Click to shrink' : 'Click to expand'}
            </span>
          </button>
        </figure>
      ) : null}

      {isImageSource && exhausted ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">Image could not be loaded</p>
          {source.imageUrl ? (
            <a
              href={source.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-2"
            >
              Open source image directly
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      ) : null}

      {source.caption ? (
        <p className="mt-2 text-sm italic text-muted-foreground">
          {source.caption}
        </p>
      ) : null}

      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
        {source.body}
      </p>

      {source.provenanceUrl ? (
        <p className="mt-1.5">
          <a
            href={source.provenanceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 break-all text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Source: {source.provenanceUrl}
            <ExternalLinkIcon className="h-2.5 w-2.5 shrink-0" />
          </a>
        </p>
      ) : null}
    </section>
  );
}

/**
 * Steps through DBQ sources one at a time with prev/next controls, instead of
 * stacking every source in one long list. Shared by the teacher review preview
 * and the student runtime panel.
 */
export function ApHistorySourceCarousel({
  sources,
}: {
  sources: ApHistorySourceCardData[];
}) {
  const ordered = useMemo(
    () => [...sources].sort((a, b) => a.position - b.position),
    [sources]
  );
  const [index, setIndex] = useState(0);

  // Reset to the first source when the set of sources changes (e.g. a
  // different prompt is selected).
  const firstKey = ordered[0]?.externalKey;
  useEffect(() => {
    setIndex(0);
  }, [ordered.length, firstKey]);

  if (ordered.length === 0) return null;

  const safeIndex = Math.min(index, ordered.length - 1);
  const source = ordered[safeIndex];
  const atStart = safeIndex === 0;
  const atEnd = safeIndex === ordered.length - 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={atStart}
          aria-label="Previous source"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="text-xs font-medium text-muted-foreground">
          Source {safeIndex + 1} of {ordered.length}
        </span>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(ordered.length - 1, i + 1))}
          disabled={atEnd}
          aria-label="Next source"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <ApHistorySourceCard key={source.externalKey} source={source} />

      {ordered.length > 1 ? (
        <div className="flex flex-wrap justify-center gap-1.5 pt-1">
          {ordered.map((candidate, dotIndex) => (
            <button
              key={candidate.externalKey}
              type="button"
              onClick={() => setIndex(dotIndex)}
              aria-label={`Go to source ${dotIndex + 1}`}
              aria-current={dotIndex === safeIndex}
              className={`h-2 w-2 rounded-full transition-colors ${
                dotIndex === safeIndex
                  ? 'bg-foreground'
                  : 'bg-foreground/25 hover:bg-foreground/50'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
