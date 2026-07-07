import { useMemo, useState } from 'react';
import { ExternalLinkIcon, ImageIcon, ZoomInIcon } from 'lucide-react';
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

      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{source.body}</p>

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
