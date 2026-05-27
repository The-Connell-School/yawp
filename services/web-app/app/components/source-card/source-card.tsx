import { useState } from 'react';
import { ExternalLinkIcon, ImageIcon, ZoomInIcon } from 'lucide-react';
import type { SourceCard as SourceCardData } from '~/routes/app.assignment-types.$id/library-data';

export function SourceCard({
  source,
  index,
}: {
  source: SourceCardData;
  index: number;
}) {
  const [imageExpanded, setImageExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const isImageSource =
    source.mediaType === 'image' || source.mediaType === 'mixed';
  const hasImage = isImageSource && source.imageUrl && !imageError;

  return (
    <li className="source-card border-l-2 border-stone-300 pl-4">
      <div className="mb-1 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Source {index + 1}
        </p>
        {isImageSource && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
            <ImageIcon className="h-3 w-3" />
            {source.mediaType === 'mixed' ? 'Text + Image' : 'Visual source'}
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold leading-snug">{source.title}</h3>
      <p className="mb-2 text-sm italic text-stone-600">{source.attribution}</p>

      {hasImage && (
        <figure className="mb-3">
          <button
            type="button"
            onClick={() => setImageExpanded(!imageExpanded)}
            className="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border border-stone-200 bg-stone-50"
          >
            <img
              src={source.imageUrl}
              alt={source.imageAlt ?? source.title}
              onError={() => setImageError(true)}
              className={`w-full object-contain transition-all ${
                imageExpanded ? 'max-h-[800px]' : 'max-h-[400px]'
              }`}
              loading="lazy"
            />
            <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
              <ZoomInIcon className="mr-1 inline h-3 w-3" />
              {imageExpanded ? 'Click to shrink' : 'Click to expand'}
            </span>
          </button>
          {source.imageAlt && (
            <figcaption className="mt-1.5 text-xs italic text-stone-500">
              {source.imageAlt}
            </figcaption>
          )}
        </figure>
      )}

      {isImageSource && source.imageUrl && imageError && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
      )}

      <p className="whitespace-pre-line text-sm leading-relaxed">
        {source.body}
      </p>

      {source.sourceUrl && (
        <p className="mt-1.5">
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 break-all text-[11px] text-stone-500 underline-offset-2 hover:underline"
          >
            Source: {source.sourceUrl}
            <ExternalLinkIcon className="h-2.5 w-2.5 shrink-0" />
          </a>
        </p>
      )}
    </li>
  );
}
