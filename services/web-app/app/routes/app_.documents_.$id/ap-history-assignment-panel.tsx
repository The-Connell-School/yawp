import { useState } from 'react';
import { ExternalLinkIcon, ImageIcon, ZoomInIcon } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import type { ApHistorySnapshot } from '~/domain/ap-history/schema';

type Props = {
  snapshot: ApHistorySnapshot;
};

type ApHistorySource = ApHistorySnapshot['sources'][number];

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function ApHistorySourceCard({ source }: { source: ApHistorySource }) {
  const [imageExpanded, setImageExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const isImageSource = source.mediaType === 'image';
  const hasImage = isImageSource && Boolean(source.imageUrl) && !imageError;

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

      {hasImage ? (
        <figure className="mt-2">
          <button
            type="button"
            onClick={() => setImageExpanded((expanded) => !expanded)}
            className="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border bg-slate-50"
          >
            <img
              src={source.imageUrl ?? undefined}
              alt={source.imageAlt ?? source.title}
              onError={() => setImageError(true)}
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

      {isImageSource && source.imageUrl && imageError ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">Image could not be loaded</p>
          <a
            href={source.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-2"
          >
            Open source image directly
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
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

export function ApHistoryAssignmentPanel({ snapshot }: Props) {
  const sourceCount = snapshot.sources.length;

  return (
    <aside className="mx-auto w-full max-w-screen-2xl border-b bg-slate-50 px-3 py-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" size="sm">
            {snapshot.essayType.toUpperCase()}
          </Badge>
          <Badge variant="outline" size="sm">
            APUSH Period {snapshot.periodNumber}
          </Badge>
          <Badge variant="outline" size="sm">
            {titleCase(snapshot.reasoningSkill)}
          </Badge>
          <Badge variant="outline" size="sm">
            {snapshot.rubric.totalPoints} rubric points
          </Badge>
          <Badge variant="outline" size="sm">
            {snapshot.timing.mode === 'timed'
              ? `${snapshot.timing.durationMinutes} min`
              : `Untimed ${snapshot.timing.durationMinutes} min`}
          </Badge>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Prompt
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {snapshot.prompt}
          </p>
        </div>

        {sourceCount > 0 ? (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-foreground marker:text-muted-foreground">
              {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
            </summary>
            <div className="mt-2 grid max-h-[min(20rem,35vh)] gap-2 overflow-y-auto pr-1">
              {[...snapshot.sources]
                .sort((a, b) => a.position - b.position)
                .map((source) => (
                  <ApHistorySourceCard
                    key={`${source.position}-${source.externalKey}`}
                    source={source}
                  />
                ))}
            </div>
          </details>
        ) : null}
      </div>
    </aside>
  );
}
